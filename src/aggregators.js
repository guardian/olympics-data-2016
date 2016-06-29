import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'
import config from '../config'


let path = config.pa.baseUrl.indexOf('uat') > -1 ? 'olympics/2016-summer-olympics' : 'olympics/2012-summer-olympics'


function parseEntrant(e){
    if (e.type === 'Team') {
        return e.country.longName
    }

    else if (e.type === 'Individual') {
        return e.participant.competitor.fullName
    }

    return null
}

export default [
    {
        'id': 'medal-table',
        'paDeps': [
            `${path}/medal-table`
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
            `${path}/schedule`
        ],
        'paMoreDeps': [
            schedule => {
                return schedule.olympics.schedule.map(day => {
                    return `${path}/schedule/` + day.date;
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
            `${path}/medal-cast`
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
                    "disciplineDescription":tableEntry.event.description,
                    "eventId":tableEntry.event.identifier
                }
            });

            return {list};
        },
        'cacheTime': moment.duration(1, 'hours')
    },{
        'id': 'medal-table-disciplines',
        'paDeps': [
            `${path}/discipline`
        ],
        'paMoreDeps': [
            discipline => {
                return discipline.olympics.discipline.filter(discipline => {
                    return discipline.identifier !== "cycling-mountain-bike"
                }).map(discipline => {
                    return `${path}/discipline/` + discipline.identifier + '/medal-table/';
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
            `${path}/schedule`
        ],
        'paMoreDeps' : [
            schedule => {
                return schedule.olympics.schedule.map(day => {
                    return `{$path}/schedule/` + day.date
                });
            },
            (schedule, daySchedules) => {

                console.log(daySchedules.length)

                return _(daySchedules).flatMap(ds => ds.olympics.scheduledEvent.filter(e => e.startListAvailable === 'Yes').map(e => {
                    return `${path}/event-unit/` + e.discipline.event.eventUnit.identifier + '/start-list'
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
            `${path}/schedule`
        ],
        'paMoreDeps' : [
            schedule => {
                return schedule.olympics.schedule.slice(0,20).map(day => {
                    return `${path}/schedule/` + day.date
                })
            },
            (schedule, daySchedules) => {

                return _(daySchedules).flatMap(ds => {
                    return _(ds.olympics.scheduledEvent).slice(0,20)
                    .filter(e => e.medalEvent === 'Yes' && e.resultAvailable === 'Yes')
                    .map(e => {
                        return `${path}/event/` + e.discipline.event.identifier
                    })
                    .valueOf()
                })
                .uniq()
                .valueOf()

            },
            (schedule, daySchedules, events) => {

                return _(events)
                    .filter(e => e.olympics.event.cumulativeResultAvailable === 'Yes')
                    .map(e => `${path}/event/` + e.olympics.event.identifier + '/cumulative-result')
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
            return {results}
        },
        cacheTime : moment.duration(2, 'hours')

    },{
        'id' : 'recent-results',
        'paDeps': [
            `${path}/medal-cast`
        ],

        'paMoreDeps' : [

            (medalCast) => {
                return _(medalCast.olympics.games.medalCast)
                    .filter(mc => mc.type === 'Gold')
                    .map(mc => mc.event.eventUnit.identifier)
                    .uniq()
                    .map(id => `${path}/event-unit/${id}/result`)
                    .valueOf()
            }
        ],

        'transform': (medalCast, eventUnitResults) => {

            let rankings = _(eventUnitResults)
                .map(r => r.olympics.eventUnit)
                .map(eu => {

                    let ev = _(medalCast.olympics.games.medalCast)
                        .find(mc => mc.event.eventUnit.identifier === eu.identifier)
                        .valueOf()
                        .event

                    return {
                        id: ev.identifier,
                        event: `${ev.description} ${ev.disciplineDescription.value}`,
                        ut : eu.unitType,
                        eList : eu.result.entrant
                    }
                })
                .map(({id, event, ut, eList}) => {

                    return {
                        'eventId' : id,
                        'eventName' : event,
                        'results' : eList.map(e => {
                            if(/Head to Head/.test(ut)){

                                console.log(e.property[0])
                                let r = e.property[0].value === 'Gold' ? 1 : 2
                                return { 'rank' : r, 'name' : parseEntrant(e) }
                            }
                            else {
                                return { 'rank' : parseInt(e.rank), 'name' : parseEntrant(e) }
                            }
                        })
                    }
                })
                .valueOf()

            return {rankings};
        },
        'cacheTime': moment.duration(1, 'hours')
    }
];

