import log from './log'

var logger = log('queue');
var items = [], interval;

async function process() {
    logger.info(`Processing ${items.length} items`);
    await Promise.all(items.map(item => item.tick().then(item.resolve)));
    logger.info('Finished processing queue');

    interval = undefined;
}

function add(tick) {
    return new Promise((resolve, reject) => {
        items.push({tick, resolve});
        if (!interval) interval = setTimeout(process, 0);
    });
}

export default {add};
