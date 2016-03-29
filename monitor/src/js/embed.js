import iframeMessenger from 'guardian/iframe-messenger'
import doT from 'olado/doT'
import moment from 'moment'
import req from './lib/req'

import embedHTML from './text/embed.html!text'
import aggregatorHTML from './text/aggregator.html!text'

const lastModifiedFormat =  'ddd, DD, MMM YYYY HH:mm:ss';
const cacheGracePeriod = 2 * 60 * 1000;

var templateFn = doT.template(embedHTML);
var aggregatorTemplateFn = doT.template(aggregatorHTML);

function app(el, aggregators, pa) {
    el.innerHTML = templateFn({aggregators, pa});

    var aggregatorsEl = el.querySelector('.js-aggregators');
    var paEl = el.querySelector('.js-pa');

    aggregators.forEach(aggregator => {
        var r = req.data(aggregator.id).then(resp => {
            var lastModified = moment.utc(r.request.getResponseHeader('Last-Modified'), lastModifiedFormat);
            var error = moment().diff(lastModified) > aggregator.cacheTime ? {'type': 'stale'} : {};
            return {lastModified, error};
        }).catch(xhr => {
            return {
                'lastUpdated': 'unknown',
                'error': {
                    'type': 'http',
                    'message': `Fetch error, status ${xhr.statusCode}`
                }
            };
        }).then(stats => {
            aggregatorsEl.innerHTML += aggregatorTemplateFn({
                'type': 'aggregator',
                'id': aggregator.id,
                'contentsUrl': 'https://interactive.guim.co.uk/olympics-2016/' + aggregator.id + '.json',
                'cacheTime': moment.duration(aggregator.cacheTime),
                stats
            });
        });
    });

    pa.forEach(paUrl => {
        paEl.innerHTML += aggregatorTemplateFn({
            'type': 'pa',
            'id': paUrl.file,
            'contentsUrl': 'http://localhost:3000/cache/' + paUrl.file,
            'stats': {'lastModified': moment.utc(paUrl.modified)}
        });
    });

    //setTimeout(() => app(el, aggregators), 30 * 1000);
}

window.init = function init(el, config) {
    iframeMessenger.enableAutoResize();

    Promise.all([req.stats('aggregators'), req.stats('pa')]).then(([aggregators, pa]) => {
        app(el, aggregators, pa);
    });
};
