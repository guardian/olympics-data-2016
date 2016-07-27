import moment from 'moment'

import scheduleAggregator from './aggregators/schedule'

export default [
    {
        'id': 'disciplines',
        'cacheTime': moment.duration(14, 'days'),
        'combiners': [{
            'name': 'disciplines',
            'dependencies': () => ['olympics/2016-summer-olympics/discipline'],
            'process': (a, [disciplines]) => {
                return disciplines.olympics.discipline.sort((a, b) => a.description < b.description ? -1 : 1);
            }
        }]
    },
    {
        'id': 'countries',
        'cacheTime' : moment.duration(14, 'days'),
        'combiners': [{
            'name' : 'countries',
            'dependencies' : () => ['olympics/2016-summer-olympics/country'],
            'process' : ({}, [countries]) => {
                return countries.olympics.country.sort((a, b) => a.name < b.name ? -1 : 1);
            }
        }]
    },
    scheduleAggregator
];
