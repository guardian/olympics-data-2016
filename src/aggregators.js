import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'

export default [
    {
        'id': 'medal-table',
        'paDeps': [
            'olympics/2016-summer-olympics/medal-table'
        ],
        'transform': medals => {
            var table = medals.olympics.games.medalTable.tableEntry.map(tableEntry => {
                return {
                    'position': parseInt(tableEntry.position),
                    'gold': parseInt(tableEntry.gold.value),
                    'silver': parseInt(tableEntry.silver.value),
                    'bronze': parseInt(tableEntry.bronze.value),
                    'countryCode': tableEntry.country.identifier,
                    'country': tableEntry.country.name
                };
            });

            return {table};
        },
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'schedule',
        'paDeps': [
            'olympics/2016-summer-olympics/schedule'
        ],
        'paMoreDeps': [
            schedule => {
                return schedule.olympics.schedule.map(day => {
                    return 'olympics/2016-summer-olympics/schedule/' + day.date;
                });
            }
        ],
        'transform': (schedule, daySchedules) => {
            var disciplines = _(daySchedules)
                .flatMap((day, dayI) => {
                    var date = schedule.olympics.schedule[dayI].date;

                    return day.olympics.scheduledEvent.map(se => {
                        return {date, 'discipline': se.discipline.identifier};
                    });
                })
                .groupBy('discipline')
                .mapValues(dateEvents => _(dateEvents).map(e => e.date).sort().uniq().value())
                .map((dates, discipline) => { return {dates, 'name': discipline}; })
                .value();

            var dates = schedule.olympics.schedule.map(s => s.date);

            return {dates, disciplines};
        },
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'recent-medals',
        'paDeps': [
            'olympics/2016-summer-olympics/medal-cast'
        ],
        'transform': medals => {
            console.log(medals.olympics.games.medalCast)
            var list = medals.olympics.games.medalCast.map(tableEntry => {
                return {
                    "medal": tableEntry.type,
                    "date":tableEntry.date,
                    "time":tableEntry.time,
                    "countryCode":tableEntry.entrant.country.identifier,
                    "country": tableEntry.entrant.country.name,
                    "athlete":tableEntry.entrant.participant ? tableEntry.entrant.participant.competitor.fullName : null,
                    "discipline":tableEntry.event.disciplineDescription.value,
                    "disciplineDescription":tableEntry.event.description
                }
            });

            return {list};
        },
        'cacheTime': moment.duration(1, 'hours')
    },{
        'id': 'medal-table-disciplines',
        'paDeps': [
            'olympics/2016-summer-olympics/discipline'
        ],
        'paMoreDeps': [
            discipline => {
                return discipline.olympics.discipline.filter(discipline => {
                    return discipline.identifier !== "cycling-mountain-bike"
                }).map(discipline => {
                    return 'olympics/2016-summer-olympics/discipline/' + discipline.identifier + '/medal-table/';
                });
            }
        ],
        'transform': (disciplines,medals) => {
            var disciplines = medals.map(discipline => {
                return {
                    "discipline": discipline.olympics.discipline.description,
                    "medal-table": discipline.olympics.discipline.medalTable.tableEntry
                }
            })
            return {disciplines};
        },
        'cacheTime': moment.duration(2, 'hours')
    },{
        'id' : 'competitors',
        'paDeps' : [
            'olympics/2016-summer-olympics/schedule'
        ],
        'paMoreDeps' : [
            schedule => {
                return schedule.olympics.schedule.map(day => {
                    return 'olympics/2016-summer-olympics/schedule/' + day.date
                });
            },
            (schedule, daySchedules) => {

                console.log(daySchedules.length)

                return _(daySchedules).slice(0,5).flatMap(ds => ds.olympics.scheduledEvent.slice(0,3).filter(e => e.startListAvailable === 'Yes').map(e => {
                    return 'olympics/2016-summer-olympics/event-unit/' + e.discipline.event.eventUnit.identifier + '/start-list'
                })).valueOf()

            } 
        ],
        'transform' : (schedule, daySchedules, startLists) => {

            let competitors = _(startLists)
                .flatMap(sl => sl.olympics.eventUnit.startList.entrant
                    .map(e => e.participant.competitor ? e.participant.competitor.fullName : 'no name')
                ).valueOf()

            console.log(competitors)

            return {competitors}

        },
        'cacheTime' : moment.duration(2, 'hours')
    },{
        'id' : 'event-results',
        'paDeps' : [
            'olympics/2016-summer-olympics/schedule'
        ],
        'paMoreDeps' : [
            schedule => {
                return schedule.olympics.schedule.slice(0,20).map(day => {
                    return 'olympics/2016-summer-olympics/schedule/' + day.date
                })
            },
            (schedule, daySchedules) => {

                return _(daySchedules).flatMap(ds => {
                    return _(ds.olympics.scheduledEvent).slice(0,20)
                    .filter(e => e.medalEvent === 'Yes' && e.resultAvailable === 'Yes')
                    .map(e => {
                        return 'olympics/2016-summer-olympics/event/' + e.discipline.event.identifier
                    })
                    .valueOf()
                })
                .uniq()
                .valueOf()

            },
            (schedule, daySchedules, events) => {

                return _(events)
                    .filter(e => e.olympics.event.cumulativeResultAvailable === 'Yes')
                    .map(e => 'olympics/2016-summer-olympics/event/' + e.olympics.event.identifier + '/cumulative-result')
            }
        ],

        'transform' : (schedule, daySchedules, events, cumulativeResults) => {

            let results = _(cumulativeResults).map(r => {
                return {

                    'eventId' : r.olympics.event.identifier,
                    'eventDescription' : r.olympics.event.description,
                    'ranking' : r.olympics.event.result.entrant.map(l => {
                        return {
                            'competitor' : l.participant.competitor ? l.participant.competitor.fullName : l.country.longName,
                            'position' : l.rank ? parseInt(l.rank) : -1
                    
                        }
                    })

                }
            })
            .valueOf()

            console.log(results)

            return {results}
        },
        cacheTime : moment.duration(2, 'hours')

    }
];
