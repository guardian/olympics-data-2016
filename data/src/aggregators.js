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

function parseId(e){
    if(e.type === 'Individual'){
        return e.participant.competitor.identifier
    }
    else if(e.type === 'Team'){
        return e.code
    }
    return null
}

function parseCompetitor(e) {

    return {
        'countryCode' : e.country.identifier,
        'country' : e.country.name,
        'athlete' : e.type === 'Individual' ? e.participant.competitor.fullName : null
    }
}


export class Aggregator {
    constructor(id, deps, moreDeps, transform){
        this.id = id
        this.paDeps = deps
        this.paMoreDeps = moreDeps
        this.transform = transform
    }
}

export var aggregators = [
    {
        'id': 'medalTable',
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
        'id': 'recentMedals',
        'paDeps': [
            `${path}/medal-cast`
        ],
        'transform': medals => {

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

            console.log(list.length)

            return {list};
        },
        'cacheTime': moment.duration(1, 'hours')
    },{
        'id': 'medalTableDisciplines',
        'paDeps': [
            `${path}/discipline`
        ],
        'paMoreDeps': [
            discipline => {
                return discipline.olympics.discipline.filter(discipline => {
                    return discipline.identifier !== "cycling-mountain-bike"
                }).map(discipline => {
                    return `${path}/discipline/${discipline.identifier}/medal-table/`;
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
        'id' : 'scheduleDetails',
        'paDeps' : [
            `${path}/schedule`
        ],
        'paMoreDeps' : [
            schedule => {
                return schedule.olympics.schedule.map(day => {
                    return `${path}/schedule/${day.date}`;
                })
            },
            (schedule, daySchedules) => {

                return _.flatMap(daySchedules, ds => {
                    return ds.olympics.scheduledEvent
                        .filter(e => e.startListAvailable === 'Yes')
                        .map(e => {
                            return `${path}/event-unit/${e.discipline.event.eventUnit.identifier}/start-list`;
                        })
                });

            } 
        ],
        'transform' : (schedule, daySchedules, startLists) => {

            let competitors = _(startLists)
                .map(sl => {
                    let eu = sl.olympics.eventUnit
                    let entrant = eu.startList.entrant
                    if(!entrant.length) entrant = [entrant]
                    return [eu.identifier, entrant.map(e => {
                        return parseCompetitor(e)
                    })]
                })
                .fromPairs()
                .valueOf()

            let scheduleDetails = _.zip(
                schedule.olympics.schedule.map(day => day.date),
                daySchedules.map(ds => { 
                    return ds.olympics.scheduledEvent.map(e => {

                        let eu = e.discipline.event.eventUnit

                        console.log(e.start)

                        return {
                            'eventUnitId' : eu.identifier,
                            'eventUnitName' : `${eu.description} (${e.discipline.description})`,
                            'location' : e.venue.name,
                            'startTime' : e.start.time, // replace with start.utc ? not available in old API though
                            'competitors' : competitors[eu.identifier]
                        }
                    })
                })
            ).map(([date, eventUnits]) => {
                return {
                    'date' : date,
                    'eventUnits' : eventUnits
                }
            })

            return { 'scheduleDetails' : scheduleDetails }

        },
        'cacheTime' : moment.duration(2, 'hours')
    },{
        'id' : 'eventResults',
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
        'cacheTime': moment.duration(2, 'hours')

    },{
        'id' : 'recentResults',
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
            },
            (medalCast, eventUnitResults) => {

                return _(eventUnitResults)
                .map(r => r.olympics.eventUnit)
                .map(eu => `${path}/event-unit/${eu.identifier}/start-list`)
                .valueOf()
            }
        ],

        'transform': (medalCast, eventUnitResults, startLists) => {

            let starts = _(startLists)
                .map(sl => [sl.olympics.eventUnit.identifier,_(sl.olympics.eventUnit.startList.entrant)
                    .map(e => {
                        console.log(e)
                        return [parseId(e), parseInt(e.order)]
                    })
                    .fromPairs()
                    .valueOf()])
                .fromPairs()
                .valueOf()

            console.log(starts)

            let rankings = _(eventUnitResults)
                .map(r => r.olympics.eventUnit)
                .map(eu => {

                    let ev = _(medalCast.olympics.games.medalCast)
                        .find(mc => mc.event.eventUnit.identifier === eu.identifier)
                        .valueOf()
                        .event

                    return {
                        evId: ev.identifier,
                        event: `${ev.description} ${ev.disciplineDescription.value}`,
                        evUnitId: eu.identifier,
                        ut : eu.unitType,
                        eList : eu.result.entrant
                    }
                })
                .map(({evId, event, evUnitId, ut, eList}) => {

                    return {
                        'eventId' : evId,
                        'eventName' : event,
                        'results' : eList.map(e => {
                            if(/Head to Head/.test(ut)){

                                let r = e.property[0].value === 'Gold' ? 1 : 2
                                return {
                                    'rank' : r,
                                    'competitor' : parseCompetitor(e),
                                    'originalPosition' : starts[evUnitId][parseId(e)]
                                }
                            }
                            else {
                                return {
                                    'rank' : parseInt(e.rank),
                                    'competitor' : parseCompetitor(e),
                                    'originalPosition' : starts[evUnitId][parseId(e)]
                                }
                            }
                        })
                    }
                })
                .valueOf()

            return {rankings};
        },
        'cacheTime': moment.duration(1, 'hours')
    },{
        'id' : 'countryMedals',
        'paDeps' : [
            `${path}/country`
        ],
        'paMoreDeps' : [

            (countries) => {
                return countries.olympics.country.map(c => `${path}/country/${c.identifier}/medal-cast`)
            }

        ],
        'transform': (countries, countryRecentMedals) => {
            return countryRecentMedals;
        },
        'cacheTime': moment.duration(1, 'hours')
    }
];

