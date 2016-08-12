import _ from 'lodash'
import moment from 'moment'
import notify from '../notify'
import { forceArray, getProperCountry } from '../aggregators'
import wrapperUnitIds from './wrapperUnitIds.json'

const roundDisciplines = {
    'badminton': 'Game Scores',
    'basketball': 'Quarter Scores',
    'beach-volleyball': 'Set Scores',
    //'boxing': 'Round Scores', has strange round scoring
    'football': 'Period Scores',
    'handball': 'Period Scores',
    'hockey': 'Period Scores',
    'rugby-sevens': 'Period Scores',
    'table-tennis': 'Game Scores',
    'tennis': 'Set Scores',
    'volleyball': 'Set Scores',
    'water-polo': 'Quarter Scores'
}

const cumulativeDisciplines = ['athletics', 'equestrian', 'golf', 'modern-pentathlon', 'sailing'];

const gymnasticsTypes = [
    'Floor Breakdown', 'Vault Breakdown', 'Beam Breakdown', 'Uneven Bars Breakdown', 'Pommelhorse Breakdown',
    'Rings Breakdown', 'Parallel Bars Breakdown', 'Horizontal Bars Breakdown'
];

const combineBlacklist = [
    'basketball', 'beach-volleyball', 'football', 'handball', 'hockey', 'rugby-sevens',
    'tennis', 'volleyball', 'water-polo'
];

function canCombine(group, evt1) {
    if (combineBlacklist.indexOf(evt1.discipline.identifier) > -1) return false;
    if (evt1.phase.value === 'Finals') return false;
    if (!group) return false;

    let evt2 = _.last(group);

    return evt1.phase.identifier === evt2.phase.identifier &&
        evt1.venue.identifier === evt2.venue.identifier &&
        evt1.start >= evt2.start &&
        moment(evt1.start).subtract(10, 'minutes').isSameOrBefore(evt2.end);
}

// Some strange guess work logic for the overall status
// Thinking is: only Scheduled/Finished when everything is
//              otherwise status of non Scheduled/Finished
//              or just Running
function combineStatuses(statuses) {
    if (statuses.length === 1) {
        return statuses[0];
    } else {
        let weirdStatuses = _.difference(statuses, ['Scheduled', 'Finished']);
        return weirdStatuses.length === 1 ? weirdStatuses[0] : 'Running';
    }
}

function combineEvents(evts) {
    let combinedEvents = _(evts)
        .sortBy(evt => `${evt.phase.identifier}:${evt.start}`)
        .reduce((groups, evt) => {
            let [group, ...otherGroups] = groups;
            return canCombine(group, evt) ?
                [[...group, evt], ...otherGroups] : [[evt], ...groups];
        }, [])
        .map(group => {
            let first = group[0];
            let description = group.length === 1 ?
                first.description : `${first.event.description} ${first.phase.value}`;
            let status = combineStatuses(_(group).map('status').uniq().valueOf());
            let resultAvailable = group.some(evt => evt.resultAvailable);
            let start = _.min(group.map(evt => evt.start));
            let end = _.max(group.map(evt => evt.end));
            return {...first, description, start, end, status, resultAvailable, group};
        });

    return combinedEvents;
}

function isValidScheduledEvent(evt) {
    if (!(evt && evt.discipline && evt.discipline.event && evt.discipline.event.eventUnit &&
        evt.discipline.event.eventUnit.phaseDescription)) return false;

    let unitId = evt.discipline.event.eventUnit.identifier;
    return wrapperUnitIds.indexOf(unitId) === -1;
}

function formatScheduleDiscipline(events) {
    let discipline = events[0].discipline;
    let venues = _(events).map('venue').uniqBy('identifier').valueOf();

    return {
        'identifier': discipline.identifier,
        'description': discipline.description,
        events, venues
    };
}

function wrapError(type, parseFn) {
    return (logger, ...args) => {
        try {
            return parseFn(...args);
        } catch (err) {
            logger.error(`Failed to parse ${type}`, err);
            logger.error(err.stack);
            notify.error(err);
            return {};
        }
    }
}

function parseValue(value) {
    return {
        'str': value,
        'cmp': value && value.split(':').reduce((t, v) => t * 60 + parseFloat(v), 0)
    };
}

function parseEntrant(entrant) {
    let properties = _(forceArray(entrant.property)).keyBy('type').mapValues('value').valueOf();
    let resultExtensions = _.keyBy(forceArray(entrant.resultExtension), 'type');

    return {
        'code': entrant.code,
        'order': parseInt(entrant.order),
        'type': entrant.type,
        'competitors': forceArray(entrant.participant).map(p => p.competitor),
        'country': entrant.country && getProperCountry(entrant.country),
        'value': parseValue(entrant.value),
        properties,
        resultExtensions,
        'medal': properties['Medal Awarded'],
        'record': properties['Record Set'],
        'invalidResultMark': properties['Invalid Result Mark']
    };
}

const parseScheduledEvent = wrapError('scheduledEvent', evt => {
    return {
        'description': evt.description,
        'start': evt.start.utc,
        'end': evt.end && evt.end.utc,
        'status': evt.status,
        'venue': evt.venue,
        'unit': _.pick(evt.discipline.event.eventUnit, ['identifier']),
        'phase': evt.discipline.event.eventUnit.phaseDescription,
        'event': _.pick(evt.discipline.event, ['identifier', 'description']),
        'discipline': _.pick(evt.discipline, ['identifier', 'description']),
        'resultAvailable': evt.resultAvailable === 'Yes',
        'startListAvailable': evt.startListAvailable === 'Yes',
        'medalEvent': evt.medalEvent === 'Yes'
    };
});

const parsePhases = wrapError('phases', (evt, events) => {
    return forceArray(evt.phase).map(phase => {
        let phaseEvents = _.filter(events, evt2 => evt2.phase.identifier === phase.identifier);

        return {
            'start': _.min(phaseEvents.map(evt2 => evt2.start)),
            'end': _.max(phaseEvents.map(evt2 => evt2.end)),
            'phase': {'identifier': phase.identifier, 'value': phase.description},
            'event': _.pick(evt, ['identifier', 'description']),
            'discipline': {
                'identifier': evt.disciplineDescription.identifier,
                'description': evt.disciplineDescription.value
            },
            'resultAvailable': phase.resultAvailable === 'Yes',
            'medalEvent': phaseEvents.some(evt => evt.medalEvent),
            'eventCount': phaseEvents.length
        };
    });
});

const parseStartList = wrapError('startList', evt => {
    let entrants = forceArray(evt.startList.entrant)
        .filter(entrant => entrant.code !== 'TBD')
        .map(parseEntrant)
        .sort((a, b) => a.order - b.order);

    return {'identifier': evt.identifier, entrants};
});

const parseResult = wrapError('result', (evt, resultObj) => {
    let entrants = forceArray(resultObj.result.entrant)
        .map(parseEntrant)
        .sort((a, b) => a.order - b.order);

    let result = {
        'identifier': resultObj.identifier,
        'discipline': evt.disciplineDescription,
        'medalEvent': evt.medalEvent === 'Yes',
        'teamEvent': evt.teamEvent === 'Yes',
        entrants
    };

    return resultReducers.reduce((res, reducer) => reducer(res), result);
});

const parsePhaseResult = (logger, evt) => parseResult(logger, evt, evt.phase);
const parseUnitResult = (logger, evt) => parseResult(logger, evt, evt);

const resultReducers = [
    // Reaction times/wind speed/average speeds
    result => {
        let entrants = result.entrants.map(entrant => {
            let reactionExtension = entrant.resultExtensions['Reaction Time'] || {};
            let windSpeedExtension = entrant.resultExtensions['Wind Speed'] || {};
            let averageSpeedExtension = entrant.resultExtensions['Average Speed'] || {};

            return {
                ...entrant,
                'reactionTime': reactionExtension.value,
                'windSpeed': forceArray(windSpeedExtension.value)[0],
                'averageSpeed': averageSpeedExtension.value
            };
        });

        let hasReactionTime = !!entrants.find(e => e.reactionTime !== undefined);
        let hasWindSpeed = !!entrants.find(e => e.windSpeed !== undefined);
        let hasAverageSpeed = !!entrants.find(e => e.averageSpeed !== undefined);

        return {...result, entrants, hasReactionTime, hasWindSpeed, hasAverageSpeed};
    },
    // Split/intermediate times
    result => {
        let entrants = result.entrants.map(entrant => {
            let splitExtension = entrant.resultExtensions['Split Times'] ||
                entrant.resultExtensions['Intermediate Times'] ||
                {};
            let splits = forceArray(splitExtension.extension)
                .sort((a, b) => +a.position - b.position)
                .map(extension => parseValue(extension.value));

            return {...entrant, splits};
        });

        let splitCount = _(entrants).map('splits.length').max();
        let splitTimes = _.range(0, splitCount)
            .map(splitNo => {
                let times = entrants
                    .map(entrant => entrant.splits[splitNo])
                    .filter(split => split !== undefined)
                    .map(split => split.cmp)
                    .sort((a, b) => a - b);
                return times;
            });

        entrants.forEach(entrant => {
            entrant.splits = _.range(0, splitCount).map(splitNo => {
                let split = entrant.splits[splitNo] || {};
                let position = splitTimes[splitNo].indexOf(split.cmp) + 1;
                return {...split, position};
            });
        });

        return {...result, entrants, splitCount};
    },
    // Round scores
    result => {
        let roundExtensionType = roundDisciplines[result.discipline.identifier];
        if (!roundExtensionType) return result;

        let entrants = result.entrants.map(entrant => {
            let roundExtension = entrant.resultExtensions[roundExtensionType] || {};
            let rounds = forceArray(roundExtension.extension)
                .sort((a, b) => +a.position - b.position)
                .map(extension => {
                    return {'name': extension.description, 'score': extension.value};
                });

            return {...entrant, rounds};
        });

        // Can we just assume all entrants have the same rounds?
        let roundNames = _(entrants).flatMap('rounds').uniqBy('name').sortBy('position').map('name').valueOf();

        let bestRoundScores = _(roundNames)
            .map(roundName => {
                let scores = entrants
                    .map(entrant => entrant.rounds.find(round => round.name === roundName))
                    .filter(round => !!round)
                    .map(round => round.score)
                    .sort((a, b) => b - a);
                return [roundName, scores[0]];
            })
            .fromPairs()
            .valueOf();

        entrants.forEach(entrant => {
            entrant.rounds.forEach(round => {
                round.winner = bestRoundScores[round.name] === round.score;
            });
        });

        let roundType = roundExtensionType.replace(' Scores', 's');

        return {...result, entrants, roundNames, roundType};
    },
    // Gymnastics breakdowns
    result => {
        let entrants = result.entrants.map(entrant => {
            let gymnastics = gymnasticsTypes
                .filter(type => !!entrant.resultExtensions[type])
                .map(type => {
                    let typeResult = entrant.resultExtensions[type].extension;
                    return {type, 'position': parseInt(typeResult.position), 'value': parseFloat(typeResult.value)};
                });
            return { ...entrant, gymnastics};
        });

        return {...result, entrants};
    },
    // Must be last, removes unprocessed API data
    result => {
        let entrants = result.entrants.map(entrant => _.omit(entrant, ['properties', 'resultExtensions']));
        return {...result, entrants};
    }
];

export default {
    'id': 'schedule',
    'cacheTime': moment.duration(5, 'minutes'),
    'combiners': [
        {
            'name': 'dates',
            'required': true,
            'dependencies': () => ['olympics/2016-summer-olympics/schedule'],
            'process': ({}, [schedule]) => {
                return forceArray(schedule.olympics.schedule).map(s => s.date);
            }
        },
        {
            'name': 'events',
            'required': true,
            'dependencies': ({dates}) => {
                return dates.map(date => `olympics/2016-summer-olympics/schedule/${date}`);
            },
            'process': ({dates}, dateSchedules, logger) => {
                let datesEvents = dateSchedules.map(ds => {
                    return forceArray(ds.olympics.scheduledEvent)
                        .filter(isValidScheduledEvent)
                        .map(evt => parseScheduledEvent(logger, evt))
                        .filter(evt => !!evt.start);
                });

                return _(dates)
                    .zip(datesEvents)
                    .flatMap(([date, dateEvents], dateNo) => {
                        return dateEvents.map(de => { return {...de, 'day': {date, dateNo}}; });
                    })
                    .keyBy('unit.identifier')
                    .valueOf();
            }
        },
        {
            'name': 'results',
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.resultAvailable && evt.status === 'Finished')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/result`);
            },
            'process': ({}, results, logger) => {
                return _(results)
                    .map(result => parseUnitResult(logger, result.olympics.eventUnit))
                    .keyBy('identifier')
                    .valueOf();
            }
        },
        {
            'name': 'phases',
            'dependencies': ({events}) => {
                return _(events)
                    .map(evt => `olympics/2016-summer-olympics/event/${evt.event.identifier}/phase`)
                    .uniq()
                    .valueOf();
            },
            'process': ({events}, phaseObjs, logger) => {
                return _(phaseObjs)
                    .flatMap(phaseObj => parsePhases(logger, phaseObj.olympics.event, events))
                    .filter(a => a.phase.identifier)
                    .keyBy('phase.identifier')
                    .valueOf();
            }
        },
        {
            'name': 'phaseResults',
            'dependencies': ({phases}) => {
                return _(phases)
                    .filter(phase => phase.resultAvailable)
                    .map(phase => `olympics/2016-summer-olympics/event-phase/${phase.phase.identifier}/result`)
                    .uniq()
                    .valueOf();
            },
            'process': ({}, phaseResults, logger) => {
                return _(phaseResults)
                    .map(result => parsePhaseResult(logger, result.olympics.event))
                    .keyBy('identifier')
                    .valueOf();
            }
        },
        {
            'name': 'startLists',
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.startListAvailable)
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/start-list`);
            },
            'process': ({events}, startLists, logger) => {
                return _(startLists)
                    .map(startList => parseStartList(logger, startList.olympics.eventUnit))
                    .keyBy('identifier')
                    .mapValues((startList, unitId) => {
                        return {...startList, 'event': events[unitId]};
                    })
                    .valueOf();
            }
        },
        {
            'name': 'scheduleByDay',
            'process': ({events}) => {
                let scheduleByDay = _(events)
                    .filter(evt => evt.status !== 'Cancelled')
                    .groupBy('day.date')
                    .map(dateEvents => {
                        let day = dateEvents[0].day;
                        let disciplines = _(dateEvents)
                            .groupBy('discipline.identifier')
                            .map(disciplineEvents => {
                                let events = combineEvents(disciplineEvents).sort((a, b) => a.start < b.start ? -1 : 1);
                                return formatScheduleDiscipline(events);
                            })
                            .sortBy('description')
                            .valueOf();

                        return {day, disciplines};
                    })
                    .sortBy('day.date')
                    .valueOf();

                return scheduleByDay;
            }
        },
        {
            'name': 'resultsByDay',
            'process': ({events}) => {
                let resultsByDay = _(events)
                    .filter(evt => evt.status === 'Finished')
                    .groupBy('day.date')
                    .map(dateEvents => {
                        let day = dateEvents[0].day;
                        let disciplines = _(dateEvents)
                            .groupBy('discipline.identifier')
                            .map(disciplineEvents => {
                                let events = combineEvents(disciplineEvents).sort((a, b) => a.end < b.end ? 1 : -1);
                                return formatScheduleDiscipline(events);
                            })
                            .orderBy(discipline => _(discipline.events).map('end').max(), 'desc')
                            .valueOf();

                        return {day, disciplines};
                    })
                    .sortBy('day.date')
                    .valueOf();

                return resultsByDay;
            }
        },
            {
            'name': 'cumulativeResults',
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.status === 'Finished')
                    .filter(evt => cumulativeDisciplines.indexOf(evt.discipline.identifier) > -1)
                    .map(evt => `olympics/2016-summer-olympics/event/${evt.event.identifier}/cumulative-result`);
            },
            'process': ({}, cumulativeResults, logger) => {
                return _(cumulativeResults)
                    .map('olympics.event')
                    .filter(result => result)
                    .map(result => parseUnitResult(logger, result))
                    .filter(result => !!result.identifier)
                    .keyBy('identifier')
                    .valueOf();
            }
        },
        {
            'name' : 'countries2',
            'dependencies' : () => ['olympics/2016-summer-olympics/country'],
            'process' : ({}, [countries]) => countries.olympics.country.map(getProperCountry)
        },
        // All very hacky
        // Some events don't have unit results, some don't have phase results, some have both.
        // the uniqBy tries to deduplicate those events
        {
            'name': 'medalsByCountry',
            'process': ({events, phases = {}, results = {}, phaseResults = {}, countries2 = []}) => {
                let medals = _({...results, ...phaseResults})
                    .flatMap(result => {
                        return result.entrants
                            .filter(entrant => !!entrant.medal)
                            .map(entrant => {
                                let event = events[result.identifier] || phases[result.identifier];
                                return {entrant, event};
                            });
                    })
                    .uniqBy(medal => `${medal.event.phase.identifier}-${medal.entrant.competitors[0].identifier}`)
                    .sortBy('event.end')
                    .reverse()
                    .groupBy('entrant.country.identifier')
                    .mapValues((medals, code) => {
                        return {
                            country: countries2.find(country => country.identifier === code),
                            medals
                        }
                    })
                    .valueOf();

                let noMedals = _(countries2)
                    .filter(country => !medals[country.identifier])
                    .keyBy('identifier')
                    .mapValues(country => { return {country, medals: []}; })
                    .valueOf()

                return {...medals, ...noMedals};
            }
        },
        {
            'name': 'startListsByCountry',
            'process': ({startLists = {}, countries2 = []}) => {
                let startListsByCountry = _(startLists)
                    .flatMap(startList => {
                        return startList.entrants.map(entrant => {
                            return {entrant, 'event': startList.event};
                        });
                    })
                    .groupBy('event.day.date')
                    .mapValues(dayStartLists => {
                        return _(dayStartLists)
                            .groupBy('entrant.country.identifier')
                            .mapValues((startList, countryCode) => {
                                return {...startList, 'country': countries2.find(c => c.identifier === countryCode)};
                            })
                            .valueOf();
                    })
                    .valueOf();
                return startListsByCountry;
            }
        },
        {
            'name' : 'lastUpdated',
            'process' : () => { return {}; }
        }
    ],
    'fallbackCombiners': []
};
