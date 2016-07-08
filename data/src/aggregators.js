import scheduleAggregators from './aggregators/schedule'
import medalAggregators from './aggregators/medals'

export default [
    ...scheduleAggregators,
    ...medalAggregators,
    {
        'id': 'disciplines',
        'paDeps': ['olympics/2016-summer-olympics/discipline'],
        'transform': disciplines => disciplines.olympics.discipline,
        'cacheTime': moment.duration(14, 'days')
    }
];
