import scheduleAggregators from './aggregators/schedule'
import medalAggregators from './aggregators/medals'
import moment from 'moment'

export default [
    ...scheduleAggregators,
    ...medalAggregators,
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
    	'cacheTime' : moment.duration(14,  'days')
    }
];
