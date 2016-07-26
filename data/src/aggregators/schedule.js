import _ from 'lodash'
import moment from 'moment'

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

function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
}

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
            if (group.length === 1) {
                return {...first, group};
            } else {
                let statuses = _.uniq(group.map(evt => evt.status));
                let status;
                // Some strange guess work logic for the overall status
                // Thinking is: only Scheduled/Finished when everything is
                //              otherwise status of non Scheduled/Finished
                //              or just Running
                if (statuses.length === 1) {
                    status = statuses[0];
                } else {
                    let weirdStatuses = _.difference(statuses, 'Scheduled', 'Finished');
                    if (weirdStatuses.length === 1) {
                        status = wierdStatuses[0];
                    } else {
                        status = 'Running';
                    }
                }

                let description = `${first.event.description} ${first.phase.value}`;
                let start = _.min(group.map(evt => evt.start));
                let end = _.max(group.map(evt => evt.end));
                return {...first, description, start, end, status, group};
            }
        })
        .sort((a, b) => a.start < b.start ? -1 : 1);

    return combinedEvents;
}

function parseScheduledEvent(evt) {
    // try to guard against all possible data problems
    if (!evt.start || !evt.discipline || !evt.discipline.event || !evt.discipline.event.eventUnit) {
        return {};
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
        'resultAvailable': evt.resultAvailable,
        'startListAvailable': evt.startListAvailable,
        'medalEvent': evt.medalEvent
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
    },
    // Must be last, removes unprocessed API data
    result => {
        let entrants = result.entrants.map(entrant => _.omit(entrant, ['properties', 'resultExtensions']));
        return {...result, entrants};
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
                    return forceArray(ds.olympics.scheduledEvent)
                        .filter(evt => evt.discipline.event.eventUnit.unitType !== 'Not Applicable')
                        .map(parseScheduledEvent)
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
            'name' : 'eventDetails',
            'dependencies' : ({events}) => _.map(events, v => {
                return `olympics/2016-summer-olympics/event/${v.event.identifier}`
            }),
            'process' : ({}, fullEvents) => {

                let flat = _(fullEvents)
                    .map(fe => fe.olympics.event)
                    .map(fe => {
                        return [ fe.identifier, {
                            gender : fe.gender
                        }]
                    })
                    .fromPairs()
                    .valueOf()

                return flat
            }
        },
        /*{
        {
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
        },
        {
            'name' : 'countries',
            'dependencies' : () => ['olympics/2016-summer-olympics/country'],
            'process' : ({}, [countries]) => countries.olympics.country
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
                                    events, venues, results : disciplineEvents.some(de => de.resultAvailable === 'Yes')
                                };
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
            'name': 'medalTable',
            'process': ({results, countries}) => {
                let medalCountries = _(results)
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

                let noMedalCountries = _(countries)
                    .filter(c1 => !medalCountries.find(c2 => c2.countryCode === c1.identifier))
                    .map(c => {
                        return {
                            country : c,
                            medals : {
                                gold : 0,
                                silver : 0,
                                bronze : 0
                            },
                            total : 0
                        }
                    })
                    .sortBy(c => c.countryCode)
                    .valueOf()

                let allCountries = medalCountries.concat(noMedalCountries)

                let medalTable = allCountries.map(c1 => {
                    let position = allCountries.findIndex(c2 => _.isEqual(c1.medals, c2.medals)) + 1;
                    return {...c1, position};
                });

                return medalTable;
            }
        },
        {
            'name': 'medalsByCountry',
            'process': ({events, results, countries, eventDetails}) => {
                let medals = _(results)
                    .filter(result => result.medalEvent)
                    .flatMap(result => {

                        return result.entrants
                            .filter(entrant => !!entrant.medal)
                            .map(entrant => {
                                return {entrant, 'event': events[result.identifier], 'eventDetails' : eventDetails[result.identifier.slice(0,-3)]};
                            });
                    })
                    .sortBy('event.end')
                    .reverse()
                    .groupBy('entrant.country.identifier')
                    .mapValues((medals, code) => {
                        return {
                            country: countries.find(c => c.identifier === code),
                            medals
                        }
                    })
                    .valueOf();

                let noMedals = _(countries)
                    .filter(c => !(medals)[c.identifier])
                    .map(c => [c.identifier, {
                        country : c,
                        medals : []
                    }])
                    .fromPairs()
                    .valueOf()

                return _.merge(medals, noMedals)
            }
        }
    ],
    'cacheTime': moment.duration(5, 'minutes')
};
