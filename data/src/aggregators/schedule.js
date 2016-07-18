import _ from 'lodash'
import moment from 'moment'

function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
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

function getCompetitors(entrant) {
    let participants = entrant.participant ? forceArray(entrant.participant) : [];
    return participants.map(p => p.competitor);
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
                'competitors': getCompetitors(entrant), // forceArray(entrant.participant).map(p => p ? p.competitor : null),
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
                    .valueOf();
            }
        },
        {
            'name': 'startLists',
            'dependencies': ({events}) => {
                return events
                    .filter(evt => evt.startListAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/start-list`);
            },
            'process': ({}, startLists) => {
                return _(startLists)
                    .map('olympics.eventUnit')
                    .keyBy('identifier')
                    .mapValues(eventUnit => {
                        return {'entrants': forceArray(eventUnit.startList.entrant)}
                    })
                    .valueOf();
            }
        },
        {
            'name': 'results',
            'dependencies': ({events}) => {
                return events
                    .filter(evt => evt.resultAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.unit.identifier}/result`);
            },
            'process': ({}, results) => {
                return _(results)
                    .map('olympics.eventUnit')
                    .keyBy('identifier')
                    .mapValues(eventUnit => {
                        return {'entrants': parseEntrants(forceArray(eventUnit.result.entrant))};
                    })
                    .valueOf();
            }
        }
    ],
    'outputs': [
        {
            'name': 'schedule',
            'process': ({events}) => _.keyBy(events, 'unit.identifier')
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

                let medalTable = countries.map(c1 => {
                    let position = countries.findIndex(c2 => _.isEqual(c1.medals, c2.medals)) + 1;
                    return {...c1, position};
                });

                return medalTable;
            }
        }
    ],
    'cacheTime': moment.duration(5, 'minutes')
};
