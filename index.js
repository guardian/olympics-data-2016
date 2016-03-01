import moment from 'moment'
import AWS from 'aws-sdk'
import config from './config'
import pa from './src/pa'
import transformers from './src/transformers'

const processors = [
    {
        'id': 'medal-table',
        'urlDeps': [
            'olympics/2012-summer-olympics/medal-table'
        ],
        'transform': transformers.medalTable,
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'test',
        'urlDeps': [
            'olympics/2012-summer-olympics/schedule',
            'olympics/2012-summer-olympics/medal-table'

        ],
        'transform': transformers.test,
        'cacheTime': moment.duration(2, 'seconds')
    }
];

var queue = (function () {
    var items = [], interval;

    function process() {
        if (items.length > 0) {
            let item = items.pop();
            item().then(process);
        } else {
            interval = undefined;
        }
    }

    function add(item) {
        items.push(item);
        if (!interval) interval = setTimeout(process, 0);
    }

    return {add};
})();

processors.forEach(processor => {
    function process() {
        console.log(`Processing ${processor.id}`);

        return Promise.all(processor.urlDeps.map(pa.request))
            .then(contents => {
                var out = processor.transform.apply(null, contents);
            }).catch(err => {
                console.error(`Error processing ${processor.id}`, err);
            });
    }

    function tick() {
        queue.add(process);
    }

    setInterval(tick, processor.cacheTime.asMilliseconds())
    tick();
});
