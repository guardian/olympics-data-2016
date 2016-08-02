import _ from 'lodash'
import moment from 'moment'
import notify from '../notify'
import { forceArray } from '../aggregators.js'

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

let first = true;
function parseScheduledEvent(evt, logger) {
    try {
        if (first) {
            first = false;
            let a = evt.start2.blah;
        }
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
        'country': entrant.country,
        'value': parseValue(entrant.value),
        properties,
        resultExtensions,
        'medal': properties['Medal Awarded'],
        'record': properties['Record Set'],
        'invalidResultMark': properties['Invalid Result Mark']
    };
}

function parseResult(eventUnit, logger) {
    try {
        let entrants = forceArray(eventUnit.result.entrant)
            .map(parseEntrant)
            .sort((a, b) => a.order - b.order);

        let result = {
            'identifier': eventUnit.identifier,
            'discipline': eventUnit.disciplineDescription,
            'medalEvent': eventUnit.medalEvent === 'Yes',
            'teamEvent': eventUnit.teamEvent === 'Yes',
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
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/result`);
            },
            'process': ({}, results, logger) => {
                return _(results)
                    .map('olympics.eventUnit')
                    .map(result => parseResult(result, logger))
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
            'name': 'medalTable',
            'process': ({results}) => {
                let medalCountries = _(results)
                    .flatMap('entrants')
                    .filter(entrant => !!entrant.medal)
                    .groupBy('country.identifier')
                    .map(countryEntrants => {
                        let country = countryEntrants[0].country;
                        let medals = _(['gold', 'silver', 'bronze'])
                            .map(medal => {
                                let count = countryEntrants.filter(e => e.medal.toLowerCase() === medal).length;
                                return [medal, count];
                            })
                            .fromPairs()
                            .valueOf();

                        let total = _(medals).values().sum();
                        return {country, medals, total};
                    })
                    .orderBy(
                        ['medals.gold', 'medals.silver', 'medals.bronze', 'country.identifier'],
                        ['desc', 'desc', 'desc', 'asc']
                    )
                    .valueOf();

                let medalTable = medalCountries.map(c1 => {
                    let position = medalCountries.findIndex(c2 => _.isEqual(c1.medals, c2.medals)) + 1;
                    return {...c1, position};
                });

                return medalTable;
            }
        },
        {
            'name' : 'countries2',
            'dependencies' : () => ['olympics/2016-summer-olympics/country'],
            'process' : ({}, [countries]) => {
                return countries.olympics.country.map(function(c) {
                    if (c.identifier === 'MKD') {c.name = 'Macedonia'};
                    if (c.identifier === 'TPE') {c.name = 'Taiwan'};
                    if (c.identifier === 'CIV') {c.name = 'Ivory Coast'};
                    if (c.identifier === 'PRK') {c.name = 'North Korea'};
                    if (c.identifier === 'HKG') {c.name = 'Hong Kong'};
                    if (c.identifier === 'LAO') {c.name = 'Laos'};    
                    if (c.identifier === 'KOR') {c.name = 'South Korea'};    
                    if (c.identifier === 'MDA') {c.name = 'Moldova'};    
                    if (c.identifier === 'RUS') {c.name = 'Russia'};    
                    if (c.identifier === 'SKN') {c.name = 'St Kitts & Nevis'};    
                    if (c.identifier === 'LCA') {c.name = 'St Lucia'};    
                    if (c.identifier === 'VIN') {c.name = 'St Vincent & the Grenadines'};  
                    return c;})
                }
        },
        {
            'name' : 'eventDetails',
            'dependencies' : ({events}) => {
                return _(events)
                    .map(v => `olympics/2016-summer-olympics/event/${v.event.identifier}`)
                    .uniq()
                    .valueOf();
            },
            'process' : ({}, eventDetails) => {
                return _(eventDetails)
                    .map('olympics.event')
                    .keyBy('identifier')
                    .mapValues(ed => { return {'gender': ed.gender}; })
                    .valueOf();
            }
        },
        {
            'name': 'medalsByCountry',
            'process': ({events, results, countries2, eventDetails = {}}) => {
                let medals = _(results)
                    .filter(result => result.medalEvent)
                    .flatMap(result => {

                        return result.entrants
                            .filter(entrant => !!entrant.medal)
                            .map(entrant => {
                                return {
                                    entrant,
                                    'event': events[result.identifier],
                                    'eventDetails': eventDetails[result.identifier.slice(0,-3)]
                                };
                            });
                    })
                    .sortBy('event.end')
                    .reverse()
                    .groupBy('entrant.country.identifier')
                    .mapValues((medals, code) => {
                        return {
                            country: countries2.find(c => c.identifier === code),
                            medals
                        }
                    })
                    .valueOf();

                let noMedals = _(countries2)
                    .filter(c => !(medals)[c.identifier])
                    .map(c => [c.identifier, {
                        country : c,
                        medals : []
                    }])
                    .fromPairs()
                    .valueOf()

                return _.merge(medals, noMedals)
            }
        },
    ],
    'fallbackCombiners': [
        {
            'name': 'medalTable',
            'dependencies': () => ['olympics/2016-summer-olympics/medal-table'],
            'process': ({}, [medalTable]) => {
                return forceArray(medalTable.olympics.games.medalTable.tableEntry)
                    .map(entry => {
                        let medals = _(['gold', 'silver', 'bronze'])
                            .map(type => [type, parseInt(entry[type].value)])
                            .fromPairs()
                            .valueOf();

                        return {
                            'country': entry.country,
                            'medals': medals,
                            'total': parseInt(entry.total.value),
                            'position': parseInt(entry.position)
                        };
                    });
            }
        }
    ]
};
