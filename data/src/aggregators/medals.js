import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'
import config from '../../config'

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
        'paDeps': ['olympics/2016-summer-olympics/medal-table'],
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
        'cacheTime': moment.duration(30, 'minutes')
    },
    {
        'id' : 'recentMedals',
        'paDeps' : ['olympics/2016-summer-olympics/discipline'],
        'paMoreDeps' : [
            (disciplines) => {
                return disciplines.olympics.discipline
                    .map(d => `olympics/2016-summer-olympics/discipline/${d.identifier}/medal-cast?limit=500`)
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
        'cacheTime' : moment.duration(10, 'minutes')
    }
];
