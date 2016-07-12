import basicAggregators from './aggregators/basic'
import scheduleAggregators from './aggregators/schedule'
import medalAggregators from './aggregators/medals'

export default [
    ...basicAggregators,
    ...scheduleAggregators,
    ...medalAggregators
];
