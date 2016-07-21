import moment from 'moment'

import scheduleAggregator from './aggregators/schedule'

export default [
    {
        'id': 'disciplines',
        'inputs': [{
            'name': 'disciplines',
            'dependencies': () => ['olympics/2016-summer-olympics/discipline'],
            'process': (a, [disciplines]) => {
                return disciplines.olympics.discipline.sort((a, b) => a.description < b.description ? -1 : 1);
            }
        }],
        'outputs': [],
        'cacheTime': moment.duration(14, 'days')
    },
    {
        'id': 'countries',
        'inputs': [{
            'name' : 'countries',
            'dependencies' : () => ['olympics/2016-summer-olympics/country'],
            'process' : ({}, [countries]) => {
                return countries.olympics.country.sort((a, b) => a.name < b.name ? -1 : 1);
            }
        }],
        'outputs': [],
        'cacheTime' : moment.duration(14, 'days')
    },
    scheduleAggregator
];
