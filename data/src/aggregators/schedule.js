import _ from 'lodash'
import moment from 'moment'

function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
}

const combineBlacklist = ['football', 'water-polo', 'hockey', 'volleyball', 'basketball'];

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
                return first;
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
        'venue': evt.venue,
        'unit': _.pick(evt.discipline.event.eventUnit, ['identifier']),
        'phase': evt.discipline.event.eventUnit.phaseDescription,
        'event': _.pick(evt.discipline.event, ['description']),
        'discipline': _.pick(evt.discipline, ['identifier', 'description']),
        'resultAvailable': evt.resultAvailable,
        'startListAvailable': evt.startListAvailable
    };
}

function parseEntrant(entrant) {
    let properties = _(forceArray(entrant.property))
        .keyBy('type')
        .mapValues('value')
        .valueOf();

    return {
        'code': entrant.code,
        'order': parseInt(entrant.order),
        'type': entrant.type,
        'competitors': forceArray(entrant.participant).map(p => p.competitor),
        'country': entrant.country,
        'value': parseFloat(entrant.value),
        'medal': properties['Medal Awarded'],
        'record': properties['Record Set'],
        'winner': properties['Won Lost Tied'] === 'Won',
        'invalidResultMark': properties['Invalid Result Mark']
    };
}

function parseResult(eventUnit) {
    let resultParser = resultParsers.find(rp => rp.test(eventUnit));

    let result = resultParser.parse(eventUnit);

    return {
        'identifier': eventUnit.identifier,
        'medalEvent': eventUnit.medalEvent === 'Yes',
        'teamEvent': eventUnit.teamEvent === 'Yes',
        ...result
    }
}

function isDiscipline(disciplines) {
    return eventUnit => {
        return disciplines.indexOf(eventUnit.disciplineDescription.identifier) > -1;
    };
}

const roundDisciplines = [
    'badminton', 'handball', 'tennis', 'football', 'beach-volleyball', 'basketball',
    'volleyball', 'water-polo', 'hockey'
];

const resultParsers = [
    {
        'test': isDiscipline(roundDisciplines),
        'parse': eventUnit => {
            let entrants = forceArray(eventUnit.result.entrant)
                .map(entrant => {
                    let basics = parseEntrant(entrant);
                    let rounds;

                    if (entrant.resultExtension) {
                        rounds = forceArray(entrant.resultExtension.extension)
                            .sort((a, b) => +a.position - b.position)
                            .map(extension => {
                                return {'name': extension.description, 'score': parseInt(extension.value)};
                            });
                    } else {
                        rounds = [];
                    }

                    return {...basics, rounds};
                })
                .sort((a, b) => a.order - b.order);

            let roundNames = _(entrants).flatMap('rounds').uniqBy('name').sortBy('position').map('name').valueOf();

            let bestRoundScores = _(roundNames)
                .map(roundName => {
                    let scores = entrants
                        .map(entrant => {
                            return entrant.rounds.find(round => round.name === roundName).score;
                        })
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

            return {entrants, roundNames};
        }
    },
    {
        'test': () => true,
        'parse': eventUnit => {
            let entrants = forceArray(eventUnit.result.entrant)
                .map(parseEntrant)
                .sort((a, b) => a.order - b.order);
            return {entrants};
        }
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
