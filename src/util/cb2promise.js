import _ from 'lodash'
import denodeify from 'denodeify'

export default function cb2promise(lib, fns) {
    return _(fns).map(fn => [fn, denodeify(lib[fn])]).fromPairs().value();
}
