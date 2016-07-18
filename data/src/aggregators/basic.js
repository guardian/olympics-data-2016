import moment from 'moment'

export default [
    {
        'id': 'disciplines',
        'inputs': [{
            'name': 'disciplines',
            'dependencies': () => ['olympics/2016-summer-olympics/discipline'],
            'process': (a, [disciplines]) => disciplines.olympics.discipline
        }],
        'outputs': [],
        'cacheTime': moment.duration(14, 'days')
    },
    {
        'id': 'countries',
        'inputs': [{
            'name' : 'countries',
            'dependencies' : () => ['olympics/2016-summer-olympics/country'],
            'process' : ({}, [countries]) => countries.olympics.country
        }],
        'outputs': [],
        'cacheTime' : moment.duration(14, 'days')
    }
];
