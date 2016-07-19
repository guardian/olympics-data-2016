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
        'event': _.pick(evt.discipline.event, ['identifier', 'description']),
        'discipline': _.pick(evt.discipline, ['identifier', 'description']),
        'resultAvailable': evt.resultAvailable,
        'startListAvailable': evt.startListAvailable
    };
}

function parseCompetitors(entrant) {
    return forceArray(entrant.participant).map(p => p.competitor);
}

function parseEntrants(entrants) {
    return _(entrants)
        .filter(entrant => entrant.code !== 'NOCOMP' && entrant.code !== 'BYE')
        .map(entrant => {
            let properties = _(forceArray(entrant.property || []))
                .map(p => [p.type, p.value])
                .fromPairs()
                .valueOf();

            return {
                'order': parseInt(entrant.order),
                'type': entrant.type,
                'competitors': parseCompetitors(entrant),
                'countryCode': entrant.country.identifier,
                'countryName': entrant.country.name,
                'medal': properties['Medal Awarded']
            };
        })
        .sortBy('order')
        .valueOf();
}

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
        },
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
                    .mapValues(eventUnit => {
                        return {
                            'identifier': eventUnit.identifier,
                            'hasMedals': eventUnit.medalEvent === 'Yes',
                            'entrants': parseEntrants(forceArray(eventUnit.result.entrant))
                        };
                    })
                    .valueOf();
            }
        },{
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

                                disciplineEvents.map(de => {
                                    console.log(de)
                                })

                                return {
                                    'identifier': disciplineEvents[0].discipline.identifier,
                                    'description': disciplineEvents[0].discipline.description,
                                    events, venues, results : disciplineEvents.some(de => de.resultAvailable === 'Yes')
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
            'process': ({results, countries}) => {
                let medalCountries = _(results)
                    .flatMap('entrants')
                    .filter(entrant => !!entrant.medal)
                    .groupBy('countryCode')
                    .map((countryEntrants, countryCode) => {
                        let medals = _(['gold', 'silver', 'bronze'])
                            .map(medal => {
                                let count = countryEntrants.filter(e => e.medal.toLowerCase() === medal).length;
                                return [medal, count];
                            })
                            .fromPairs()
                            .valueOf();

                        let total = _(medals).values().sum();
                        return {countryCode, medals, total};
                    })
                    .orderBy(
                        ['medals.gold', 'medals.silver', 'medals.bronze', 'countryCode'],
                        ['desc', 'desc', 'desc', 'asc']
                    )
                    .valueOf();

                let noMedalCountries = _(countries)
                    .filter(c1 => !medalCountries.find(c2 => c2.countryCode === c1.identifier))
                    .map(c => {
                        return {
                            countryCode : c.identifier,
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
                    .filter(result => result.hasMedals)
                    .flatMap(result => {

                        return result.entrants
                            .filter(entrant => !!entrant.medal)
                            .map(entrant => {
                                return {entrant, 'event': events[result.identifier], 'eventDetails' : eventDetails[result.identifier.slice(0,-3)]};
                            });
                    })
                    .sortBy('event.end')
                    .reverse()
                    .groupBy('entrant.countryCode')
                    .toPairs()
                    .map(([code, medals]) => {
                        return [code, {
                            country : countries.find(c => c.identifier === code),
                            medals
                        }]
                    })
                    .fromPairs()
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
