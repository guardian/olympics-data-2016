import moment from 'moment'
import _ from 'lodash'
import { forceArray, getProperCountry } from '../aggregators'

export default [
    {
        'id': 'disciplines',
        'cacheTime': moment.duration(14, 'days'),
        'combiners': [{
            'name': 'disciplines',
            'required': true,
            'dependencies': () => ['olympics/2016-summer-olympics/discipline'],
            'process': (a, [disciplines]) => {
                return disciplines.olympics.discipline.sort((a, b) => a.description < b.description ? -1 : 1);
            }
        }]
    },
    {
        'id': 'countries',
        'cacheTime': moment.duration(14, 'days'),
        'combiners': [{
            'name': 'countries',
            'required': true,
            'dependencies': () => ['olympics/2016-summer-olympics/country'],
            'process': ({}, [countries]) => {
                return countries.olympics.country.map(getProperCountry).sort((a, b) => a.name < b.name ? -1 : 1);
            }
        }]
    },
    {
        'id': 'snap',
        'cacheTime': moment.duration(5, 'minutes'),
        'combiners': [{
            'name': 'latestMedals',
            'required': true,
            'dependencies': () => ['olympics/2016-summer-olympics/medal-cast'],
            'process': ({}, [medalCast]) => {
                if (!medalCast.olympics.games) return [];

                let medalsGroupedByEventUnit = _(forceArray(medalCast.olympics.games.medalCast))
                    .groupBy('event.eventUnit.identifier')
                    .mapValues(eventUnitMedals => {
                        return eventUnitMedals.map(medal => {
                            let participantArr = forceArray(medal.entrant.participant);

                            medal.type = medal.type.toLowerCase();
                            medal.entrant.participant = participantArr;

                            return medal;
                        });
                    });

                return _.toArray(medalsGroupedByEventUnit).map(eventMedals => {
                    let event = _.head(eventMedals).event;

                    let eventName = event.description;
                    let discipline = event.disciplineDescription.value;

                    return {'eventName': eventName, 'discipline': discipline, 'medals': eventMedals}
                });
            }
        }]
    },
    {
        'id': 'medals',
        'cacheTime': moment.duration(5, 'minutes'),
        'combiners': [{
            'name': 'medalTable',
            'dependencies': () => ['olympics/2016-summer-olympics/medal-table'],
            'process': ({}, [medalTable]) => {
                return forceArray(medalTable.olympics.games.medalTable.tableEntry)
                    .map(entry => {
                        let medals = _(['gold', 'silver', 'bronze'])
                            .map(type => [type, parseInt(entry[type].value)])
                            .fromPairs()
                            .valueOf();

                        return {
                            'country': getProperCountry(entry.country),
                            'medals': medals,
                            'total': parseInt(entry.total.value),
                            'position': parseInt(entry.position)
                        };
                    });
            }
        }]
    }
];
