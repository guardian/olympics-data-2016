import _ from 'lodash'
import moment from 'moment'

const roundDisciplines = {
    'badminton': 'Game Scores',
    'basketball': 'Quarter Scores',
    'beach-volleyball': 'Set Scores',
    'boxing': 'Round Scores',
    'football': 'Period Scores',
    'handball': 'Period Scores',
    'hockey': 'Period Scores',
    'rugby-sevens': 'Period Scores',
    'table-tennis': 'Game Scores',
    'tennis': 'Set Scores',
    'volleyball': 'Set Scores',
    'water-polo': 'Quarter Scores'
}

function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
}

const combineBlacklist = Object.keys(roundDisciplines);

function canCombine(group, evt1) {
    if (group && combineBlacklist.indexOf(evt1.discipline.identifier) === -1) {
        let evt2 = group[0];

        return evt1.phase.identifier === evt2.phase.identifier &&
            evt1.venue.identifier === evt2.venue.identifier &&
            evt1.start >= evt2.start &&
            moment(evt1.start).subtract(10, 'minutes').isSameOrBefore(evt2.end)
    }
    return false;
}

function combineEvents(evts) {
    let combinedEvents = _(evts)
        .sortBy(evt => `${evt.phase.identifier}:${evt.start}`)
        .reduce((groups, evt) => {
            let [group, ...otherGroups] = groups;
            return canCombine(group, evt) ?
                [[evt, ...group], ...otherGroups] : [[evt], ...groups];
        }, [])
        .map(group => {
            let first = group[0];
            if (group.length === 1) {
                return {...first, group};
            } else {
                let description = `${first.event.description} ${first.phase.value}`;
                let start = _.min(group.map(evt => evt.start));
                let end = _.max(group.map(evt => evt.end));
                return {...first, description, start, end, group};
            }
        })
        .sort((a, b) => a.start < b.start ? -1 : 1);

    return combinedEvents;
}

function parseScheduledEvent(evt) {
    return {
        'description': evt.description,
        'start': evt.start.utc,
        'end': evt.end && evt.end.utc,
        'status': evt.status,
        'venue': evt.venue,
        'unit': _.pick(evt.discipline.event.eventUnit, ['identifier']),
        'phase': evt.discipline.event.eventUnit.phaseDescription,
        'event': _.pick(evt.discipline.event, ['description']),
        'discipline': _.pick(evt.discipline, ['identifier', 'description']),
        'resultAvailable': evt.resultAvailable,
        'startListAvailable': evt.startListAvailable
    };
}

function parseValue(value) {
    return {
        'str': value,
        'cmp': value && value.split(':').reduce((t, v) => t * 60 + parseFloat(v), 0)
    };
}

function parseEntrant(entrant) {
    let properties = _(forceArray(entrant.property))
        .keyBy('type')
        .mapValues('value')
        .valueOf();

    let resultExtensions = _.keyBy(forceArray(entrant.resultExtension), 'type');

    return {
        'code': entrant.code,
        'order': parseInt(entrant.order),
        'rank': parseInt(entrant.rank),
        'type': entrant.type,
        'competitors': forceArray(entrant.participant).map(p => p.competitor),
        'country': entrant.country,
        'value': parseValue(entrant.value),
        properties,
        resultExtensions,
        'medal': properties['Medal Awarded'],
        'record': properties['Record Set'],
        'winner': properties['Won Lost Tied'] === 'Won',
        'invalidResultMark': properties['Invalid Result Mark'],
        'qualified': (properties['Qualification Mark'] || '').startsWith('Qualified')
    };
}

function parseResult(eventUnit) {
    let entrants = forceArray(eventUnit.result.entrant)
        .map(parseEntrant)
        .sort((a, b) => a.order - b.order);

    let qualificationSpots = entrants.filter(e => e.qualified).length;

    let result = {
        'identifier': eventUnit.identifier,
        'discipline': eventUnit.disciplineDescription,
        'medalEvent': eventUnit.medalEvent === 'Yes',
        'teamEvent': eventUnit.teamEvent === 'Yes',
        entrants,
        qualificationSpots
    };

    return resultReducers.reduce((res, reducer) => reducer(res), result);
}

const resultReducers = [
    // Reaction times/wind speed
    result => {
        let entrants = result.entrants.map(entrant => {
            let reactionExtension = entrant.resultExtensions['Reaction Time'] || {};
            let windSpeedExtension = entrant.resultExtensions['Wind Speed'] || {};

            return {
                ...entrant,
                'reactionTime': reactionExtension.value,
                'windSpeed': windSpeedExtension.value
            };
        });

        let hasReactionTime = !!entrants.find(e => e.reactionTime !== undefined);
        let hasWindSpeed = !!entrants.find(e => e.windSpeed !== undefined);

        return {...result, entrants, hasReactionTime, hasWindSpeed};
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

        let splitCount = _(entrants).map(e => e.splits.length).max();
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
                let qualifying = position > 0 && position <= result.qualificationSpots;
                return {...split, position, qualifying};
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
    }
];

export default {
    'id': 'schedule',
    'inputs': [
        {
            'name': 'dates',
            'dependencies': () => ['olympics/2016-summer-olympics/schedule'],
            'process': ({}, [schedule]) => {
                return forceArray(schedule.olympics.schedule).map(s => s.date);
            }
        },
        {
            'name': 'events',
            'dependencies': ({dates}) => {
                return dates.map(date => `olympics/2016-summer-olympics/schedule/${date}`);
            },
            'process': ({dates}, dateSchedules) => {
                let datesEvents = dateSchedules.map(ds => {
                    return forceArray(ds.olympics.scheduledEvent).map(parseScheduledEvent);
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
        /*{
            'name': 'startLists',
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.startListAvailable === 'Yes')
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
            'name': 'results',
            'dependencies': ({events}) => {
                return _.values(events)
                    .filter(evt => evt.resultAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/result`);
            },
            'process': ({}, results) => {
                return _(results)
                    .map('olympics.eventUnit')
                    .keyBy('identifier')
                    .mapValues(parseResult)
                    .valueOf();
            }
        }
    ],
    'outputs': [
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
                                let events = combineEvents(disciplineEvents);
                                let venues = _(events).map('venue').uniqBy('identifier').valueOf();
                                return {
                                    'identifier': disciplineEvents[0].discipline.identifier,
                                    'description': disciplineEvents[0].discipline.description,
                                    events, venues
                                };
                            })
                            .valueOf();

                        return {day, disciplines};
                    })
                    .sortBy('day.date')
                    .valueOf();

                return scheduleByDay;
            }
        },
        {
            'name': 'medalTable',
            'process': ({results}) => {
                let countries = _(results)
                    .flatMap('entrants')
                    .filter(entrant => !!entrant.medal)
                    .groupBy('country.identifier')
                    .map((countryEntrants, countryId) => {
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
                        ['medals.gold', 'medals.silver', 'medals.bronze', 'country.code'],
                        ['desc', 'desc', 'desc', 'asc']
                    )
                    .valueOf();

                let medalTable = countries.map(c1 => {
                    let position = countries.findIndex(c2 => _.isEqual(c1.medals, c2.medals)) + 1;
                    return {...c1, position};
                });

                return medalTable;
            }
        },
        {
            'name': 'medalsByCountry',
            'process': ({events, results}) => {
                return _(results)
                    .filter(result => result.medalEvent)
                    .flatMap(result => {
                        return result.entrants
                            .filter(entrant => !!entrant.medal)
                            .map(entrant => {
                                return {entrant, 'event': events[result.identifier]};
                            });
                    })
                    .sortBy('event.end')
                    .reverse()
                    .groupBy('entrant.countryCode')
                    .valueOf();
            }
        }
    ],
    'cacheTime': moment.duration(5, 'minutes')
};
