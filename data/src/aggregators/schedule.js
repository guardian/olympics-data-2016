import _ from 'lodash'
import moment from 'moment'
import notify from '../notify'
import { forceArray, getProperCountry } from '../aggregators'


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


const phasesWithoutUnitResults = [
    'GAM0241', 'GAM0249', 'GAM4001', 'GAM4009', 'GAW0241', 'GAW0249', 'GAW4001', 'GAW4009'
]

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

function formatScheduleDiscipline(events) {
    let discipline = events[0].discipline;
    let venues = _(events).map('venue').uniqBy('identifier').valueOf();

    return {
        'identifier': discipline.identifier,
        'description': discipline.description,
        events, venues
    };
}

// Returns a event unit for a given phaseId
function getPhaseUnits(events, phaseId) {
    return _.filter(events, evt => evt.phase.identifier === phaseId);
}

function parseScheduledEvent(evt, logger) {
    try {
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
    } catch (err) {
        logger.error('Failed to parse scheduled event', err);
        logger.error(err.stack);
        notify.error(err);
        return {};
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
        'country': getProperCountry(entrant.country),
        'value': parseValue(entrant.value),
        properties,
        resultExtensions,
        'medal': properties['Medal Awarded'],
        'record': properties['Record Set'],
        'invalidResultMark': properties['Invalid Result Mark']
    };
}

function parseResult(evt, resultObj, logger) {
    try {
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

        // Reducers are extra
        try {
            return resultReducers.reduce((res, reducer) => reducer(res), result);
        } catch (err) {
            logger.error('Failed to apply result reducers', err);
            logger.error(err.stack);
            notify.error(err);
            return result;
        }
    } catch (err) {
        logger.error('Failed to parse result', err);
        logger.error(err.stack);
        notify.error(err);
        return {};
    }
}

const parsePhaseResult = (evt, logger) => parseResult(evt, evt.phase, logger);
const parseUnitResult = (evt, logger) => parseResult(evt, evt, logger);

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
                        .filter(evt => evt.discipline && evt.discipline.event && evt.discipline.event.eventUnit)
                        .filter(evt => evt.discipline.event.eventUnit.unitType !== 'Not Applicable')
                        .map(evt => parseScheduledEvent(evt, logger))
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
            'required': true,
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.resultAvailable)
                    .filter(evt => evt.status === 'Finished')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/result`);
            },
            'process': ({}, results, logger) => {
                return _(results)
                    .map('olympics.eventUnit')
                    .map(result => parseUnitResult(result, logger))
                    .filter(result => !!result.identifier)
                    .keyBy('identifier')
                    .valueOf();
            }
        },
        /*{
            'name': 'startLists',
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.startListAvailable)
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/start-list`);
            },
            'process': ({}, startLists) => {
                return _(startLists)
                    .map('olympics.eventUnit')
                    .keyBy('identifier')
                    .mapValues(eventUnit => {
                        return {
                            'identifier': eventUnit.identifier,
                            'entrants': forceArray(eventUnit.startList.entrant)
                        };
                    })
                    .valueOf();
            }
        },*/
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
                    .filter(evt => evt.resultAvailable)
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
                    .filter(event => event)
                    .map(result => parseUnitResult(result, logger))
            }
        },
        {
            'name': 'phasesWithResults',
            'dependencies': ({events}) => {
                return _(events)
                    .filter(evt => phasesWithoutUnitResults.indexOf(evt.phase.identifier) > -1)
                    .map('event.identifier')
                    .uniq()
                    .map(eventId => `olympics/2016-summer-olympics/event/${eventId}/phase`)
                    .valueOf();
            },
            'process': ({}, eventPhases) => {
                return _(eventPhases)
                    .flatMap(eventPhase => forceArray(eventPhase.olympics.event.phase))
                    .filter(phase => phase.resultAvailable === 'Yes')
                    .valueOf();
            }
        },
        {
            'name': 'phaseResults',
            'dependencies': ({phasesWithResults}) => {
                return phasesWithResults
                    .map(phase => `olympics/2016-summer-olympics/event-phase/${phase.identifier}/result`);
            },
            'process': ({events}, phaseResults, logger) => {
                return _(phaseResults)
                    .map('olympics.event')
                    .map(result => {
                        let phaseResult = parsePhaseResult(result, logger);
                        let units = getPhaseUnits(events, phaseResult.identifier);
                        // phases don't indicate if they contain medal events
                        let medalEvent = units.some(unit => unit.medalEvent);
                        return {...phaseResult, medalEvent, units};
                    })
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
        {
            'name': 'medalsByCountry',
            'process': ({events, results, phaseResults, countries2}) => {
                let phaseUnitResults = _.values(phaseResults)
                    .filter(phaseResult => phaseResult.medalEvent)
                    .map(phaseResult => {
                        return {...phaseResult, 'identifier': phaseResult.units[0].unit.identifier};
                    });

                let allResults = _.values(results).concat(phaseUnitResults);

                let medals = _(allResults)
                    .flatMap(result => {
                        return result.entrants
                            .filter(entrant => !!entrant.medal)
                            .map(entrant => { return {entrant, 'event': events[result.identifier]}; });
                    })
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

                return _.merge(medals, noMedals)
            }
        },
        {
            'name' : 'lastUpdated',
            'process' : () => {
                return {}
            }
        }
    ],
    'fallbackCombiners': []
};
