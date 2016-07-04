var items = [], interval;

function process() {
    if (items.length > 0) {
        let [item, resolve] = items.shift();
        item().then(resolve).then(process);
    } else {
        console.log('Finished processing queue');
        interval = undefined;
    }
}

function add(item) {
    return new Promise((resolve, reject) => {
        items.push([item, resolve]);
        if (!interval) interval = setTimeout(process, 0);
    });
}

export default {add};
