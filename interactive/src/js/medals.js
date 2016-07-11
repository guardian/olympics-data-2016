import { $, $$ } from './lib/selector'
import reqwest from 'reqwest'

let lbButton = $('.js-leaderboard-button')
let rButton = $('.js-recent-button')
let countries = $$('.om-table-row')

function hideWhatShallBeHidden() { // no, this is not a permanent name

    let id_ = dSelect.options[dSelect.selectedIndex].value
    let disciplines = $$('.om-recent-discipline')
    disciplines.forEach(ev => {
        if (id_ === '' || id_ === ev.getAttribute('data-discipline')) {
            ev.classList.remove('is-hidden')
        } else {
            ev.classList.add('is-hidden')
        }
    })
} 

lbButton.addEventListener('click', e => {
    countries.slice(10).forEach(function(el){
        el.classList.toggle('om-table-row--hidden')
    })
    lbButton.innerHTML = (lbButton.innerHTML === 'Hide countries') ? 'All countries' : 'Hide countries'
})

let dSelect = $('.om-select-discipline')
let cSelect = $('.om-select-country')
let container = $('.om-recent')

dSelect.addEventListener('change', () => {
    hideWhatShallBeHidden()
})

cSelect.addEventListener('change', () => {
    let id_ = cSelect.options[cSelect.selectedIndex].value
    console.log(id_)
})

rButton.addEventListener('click', e => {
    let date = '2016-02-25'
    reqwest(`./medals/days/dayMedals-${date}.html`).then(resp => {
        container.innerHTML += resp
        hideWhatShallBeHidden()
    })
})