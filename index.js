import moment from 'moment'
import pa from './src/pa'
import s3 from './src/s3'
import transformers from './src/transformers'
import queue from './src/queue'

const aggregators = [
    {
        'id': 'medal-table',
        'paDeps': [
            'olympics/2012-summer-olympics/medal-table'
        ],
        'transform': transformers.medalTable,
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'test',
        'paDeps': [
            'olympics/2012-summer-olympics/schedule',
            'olympics/2012-summer-olympics/medal-table'

        ],
        'transform': transformers.test,
        'cacheTime': moment.duration(2, 'seconds')
    }
];

aggregators.forEach(aggregator => {
    function process() {
        console.log(`Processing ${aggregator.id}`);

        return Promise.all(aggregator.paDeps.map(pa.request)).then(contents => {
            var out = aggregator.transform.apply(null, contents);
            return s3.put(aggregator.id, out, aggregator.cacheTime);
        }).then(() => {
            setTimeout(tick, aggregator.cacheTime.asMilliseconds())
        }).catch(err => {
            console.error(`Error processing ${aggregator.id}`, err);
            setTimeout(tick, aggregator.cacheTime.asMilliseconds())
        });
    }

    function tick() {
        queue.add(process);
    }

    tick();
});
