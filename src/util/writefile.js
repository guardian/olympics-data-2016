import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'

export default function writefile(file, content) {
    function run(cb) {
        mkdirp(path.dirname(file), err => {
            if (err) return cb(err);
            fs.writeFile(file, content, cb);
        });
    }

    return new Promise((resolve, reject) => {
        run(err => err ? reject(err) : resolve());
    });
}
