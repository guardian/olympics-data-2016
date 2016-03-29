import fs from 'fs'
import path from 'path'
import express from 'express'
import cors from 'cors'
import moment from 'moment'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import aggregators from './src/aggregators'
import config from './config'

function run(aggregatorTickers) {
    var app = express();

    function readdir(d) {
        var g = glob();
        return denodeify(g.readdir.bind(g))(d);
    }

    var fsStat = denodeify(fs.stat);
    var fsUnlink = denodeify(fs.unlink);

    function paCacheStats(file) {
        return fsStat(file).then(stat => {
            return {'file': file.replace(config.pa.cacheDir, ''), 'modified': stat.mtime};
        });
    }

    app.get('/aggregators.json', cors(), (req, res) => {
        var out = aggregators.map(aggregator => {
            return {
                'id': aggregator.id,
                'cacheTime': aggregator.cacheTime.asMilliseconds()
            };
        });
        res.send(out);
    });

    app.get('/pa.json', cors(), (req, res) => {
        readdir(config.pa.cacheDir + '/**/*.json').then(files => {
            return Promise.all(files.map(paCacheStats));
        }).then(stats => {
            res.send(stats);
        }).catch(err => {
            res.status(500).send(err);
        });
    });

    app.post('/refresh', (req, res) => {
        var {id, type} = req.query;

        if (type === 'pa') {
            let file = path.normalize(path.join(config.pa.cacheDir, id));
            if (file.indexOf(config.pa.cacheDir) === 0) {
                fsUnlink(file)
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
        } else if (type === 'aggregator' && aggregatorTickers[id] !== undefined) {
            aggregatorTickers[id]()
                .then(() => res.status(204).send())
                .catch(err => res.status(500).send(err));
        } else {
            res.status(404).send();
        }
    });

    app.use('/cache', express.static(config.pa.cacheDir));

    app.listen(3000, () => console.log('Listening on port 3000'));
}

export default {run}
