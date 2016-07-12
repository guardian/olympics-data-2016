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
        athlete = e.participant.competitor.firstName[0] + '. ' + e.participant.competitor.lastName
    }
    // else if(e.type === 'Team'){
    //     if(e.participant.length === 2){
    //         athlete = e.participant.map(p => p.competitor.lastName).sort().join('/')
    //     }
    //     else {
    //         athlete = e.country.name
    //     }
    // }
    return {
        'countryCode' : e.country.identifier,
        'country' : e.country.name,
        'athlete' : athlete
    }
}

function parseDisplayStr(c) {
    if(c.athlete) return `${c.athlete} (${c.countryCode})`
    return c.country
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
        'id' : 'recentMedals',
        'paDeps' : [
            `${path}/discipline/`
        ],
        'paMoreDeps' : [
            (disciplines) => {
                return disciplines.olympics.discipline
                    .map(d => `${path}/discipline/${d.identifier}/medal-cast?limit=500`)
            }
        ],
        'transform' : (disciplines, medalCasts) => {
            return _(medalCasts)
                .filter(mc => mc.olympics)
                .map(mc => mc.olympics.discipline.medalCast
                    .map(m => {
                        return {
                            type: m.type,
                            discipline: m.event.disciplineDescription.value,
                            disciplineId: m.event.disciplineDescription.identifier,
                            time: m.utc,
                            competitor: parseCompetitor(m.entrant),
                            displayStr : parseDisplayStr(parseCompetitor(m.entrant)),
                            eventName: m.event.description,
                            eventId: m.event.identifier,
                            eventUnitId : m.event.eventUnit.identifier
                        }
                    }))
                .flatten()
        },
        'cacheTime' : moment.duration(2, 'hours')
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
                        discipline: ev.disciplineDescription.value,
                        event: ev.description,
                        evUnitId: eventUnit.identifier,
                        unitType : eventUnit.unitType,
                        eList : eventUnit.result.entrant
                    }
                })
                .map(({evId, discipline, event, evUnitId, unitType, eList}) => {
                    let results = eList.map(e => {
                        let rank = /Head to Head/.test(unitType) ?
                            (e.property[0].value === 'Gold' ? 1 : 2) :
                            parseInt(e.rank);
                        return {rank, 'competitor': parseCompetitor(e)};
                    });

                    return {
                        'eventId' : evId,
                        'eventName' : event,
                        'discipline' : discipline,
                        results
                    }

                    // let medals = _.sortBy(results, 'rank')
                    //     .filter(r => r.rank <= 3)
                    //     .map(r => {
                    //         r.medal = ['gold', 'silver', 'bronze'][r.rank - 1]
                    //         return r;
                    //     });

                    // return {
                    //     'eventId' : evId,
                    //     'eventName' : event,
                    //     results,
                    //     medals
                    // }
                });

            return {rankings};
        },
        'cacheTime': moment.duration(1, 'hours')
    },
    /*{
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
    }*/
];
