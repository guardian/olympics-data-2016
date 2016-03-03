var items = [], interval;

function process() {
    if (items.length > 0) {
        let item = items.shift();
        item().then(process);
    } else {
        console.log('Finished processing queue');
        interval = undefined;
    }
}

function add(item) {
    items.push(item);
    if (!interval) interval = setTimeout(process, 0);
}

export default {add};
