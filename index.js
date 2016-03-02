import aggregators from './src/aggregators'
import queue from './src/queue'
import pa from './src/pa'
import s3 from './src/s3'

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
