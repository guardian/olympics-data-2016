import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'
import config from '../../config'

let path = config.pa.baseUrl.indexOf('uat') > -1 ? 'olympics/2016-summer-olympics' : 'olympics/2012-summer-olympics'

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

    let athlete = null

    if(e.type === 'Individual'){
        athlete = e.participant.competitor.fullName
    }
    else if(e.type === 'Team'){
        if(e.participant.length === 2){
            athlete = e.participant.map(p => p.competitor.lastName).sort().join('/')
        }
        else {
            athlete = e.country.name
        }
    }

    return {
        'countryCode' : e.country.identifier,
        'country' : e.country.name,
        'athlete' : athlete
    }
}

export default [
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

            return {list};
        },
        'cacheTime': moment.duration(1, 'hours')
    },
    {
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
    },
    {
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

    },
    {
        'id' : 'recentResults',
        'paDeps': [
            `${path}/medal-cast`
        ],

        'paMoreDeps' : [

            (medalCast) => {
                return _(medalCast.olympics.games.medalCast)
                    .filter(mc => mc.type === 'Gold')
                    .map(mc => `${path}/event-unit/${mc.event.eventUnit.identifier}/result`)
                    .uniq()
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
                        return [parseId(e), parseInt(e.order)]
                    })
                    .fromPairs()
                    .valueOf()])
                .fromPairs()
                .valueOf()

            let rankings = eventUnitResults
                .map(r => r.olympics.eventUnit)
                .map(eventUnit => {
                    let ev = medalCast.olympics.games.medalCast
                        .find(mc => mc.event.eventUnit.identifier === eventUnit.identifier)
                        .event

                    return {
                        evId: ev.identifier,
                        event: `${ev.description} ${ev.disciplineDescription.value}`,
                        evUnitId: eventUnit.identifier,
                        unitType : eventUnit.unitType,
                        eList : eventUnit.result.entrant
                    }
                })
                .map(({evId, event, evUnitId, unitType, eList}) => {
                    let results = eList.map(e => {
                        let rank = /Head to Head/.test(unitType) ?
                            (e.property[0].value === 'Gold' ? 1 : 2) :
                            parseInt(e.rank);
                        return {rank, 'competitor': parseCompetitor(e)};
                    });

                    let medals = _.sortBy(results, 'rank')
                        .filter(r => r.rank <= 3)
                        .map(r => {
                            r.medal = ['gold', 'silver', 'bronze'][r.rank - 1]
                            return r;
                        });

                    return {
                        'eventId' : evId,
                        'eventName' : event,
                        results,
                        medals
                    }
                });

            return {rankings};
        },
        'cacheTime': moment.duration(1, 'hours')
    },
    {
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
