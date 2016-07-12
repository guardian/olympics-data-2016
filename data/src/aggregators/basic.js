import moment from 'moment'

export default [
    {
        'id': 'disciplines',
        'paDeps': ['olympics/2016-summer-olympics/discipline'],
        'transform': disciplines => disciplines.olympics.discipline,
        'cacheTime': moment.duration(14, 'days')
    },
    {
        'id' : 'countries',
        'paDeps' : ['olympics/2016-summer-olympics/country'],
        'transform' : countries => countries.olympics.country,
        'cacheTime' : moment.duration(14, 'days')
    },
    {
        'id' : 'schedule',
        'paDeps' : ['olympics/2016-summer-olympics/schedule'],
        'transform' : schedule => schedule.olympics.schedule.map(s => s.date),
        'cacheTime' : moment.duration(14, 'days')
    }
];
