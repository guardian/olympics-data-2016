import fs from 'fs'
import path from 'path'
import express from 'express'
import moment from 'moment'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import aggregators from './src/aggregators'
import config from './config'

var app = express();

function readdir(d) {
    var g = glob();
    return denodeify(g.readdir.bind(g))(d);
}

var fsStat = denodeify(fs.stat);
var fsUnlink = denodeify(fs.unlink);

function fileModifiedTime(file) {
    return fsStat(file).then(stat => {
        return {file, 'modified': stat.mtime};
    });
}

app.get('/aggregators.json', (req, res) => {
    var out = aggregators.map(aggregator => {
        return {
            'id': aggregator.id,
            'cacheTime': aggregator.cacheTime.asMilliseconds()
        };
    });
    res.send(out);
});

app.get('/pa.json', (req, res) => {
    readdir(config.pa.cacheDir + '/**/*.json').then(files => {
        return Promise.all(files.map(fileModifiedTime));
    }).then(stats => {
        res.send(stats);
    }).catch(err => {
        res.status(500).send(err);
    });
});

app.post('/refresh', (req, res) => {
    var file = path.normalize(req.query.file);

    if (file.indexOf(config.pa.cacheDir) === 0) {
        fsUnlink(req.query.file)
            .then(() => res.status(204).send())
            .catch(err => {
                if (err && err.code === 'ENOENT') {
                    res.status(404).send();
                } else {
                    res.status(500).send(err);
                }
            });
    } else {
        res.status(404).send();
    }
});

app.listen(3000, () => console.log('Listening on port 3000'));
