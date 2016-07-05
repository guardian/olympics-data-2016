var expandBtnEl = document.querySelector('#section-leaderboard #expand-button');
expandBtnEl.addEventListener('click',function(e){
    var tableEl = document.querySelector('#section-leaderboard table');
    if(tableEl.className.indexOf('show-hidden') > -1){
        tableEl.className = "";
        expandBtnEl.className = "";
        expandBtnEl.innerHTML = "More countries"
    }else{
        tableEl.className = "show-hidden";
        expandBtnEl.className = "hide-button";
        expandBtnEl.innerHTML = "Less countries"
    }
})

var extraBtns = document.querySelectorAll('#section-recentmedals .recentmedals-row-extra-btn button');
for(var i =0; i<extraBtns.length; i++){
    extraBtns[i].addEventListener('click',function(e){
        var tbodyEl = e.target.parentElement.parentElement.parentElement;
        var listItemContainer = tbodyEl.querySelector('.recentmedals-row-allresults');

        if(listItemContainer.className.indexOf('row-open') > -1){
            listItemContainer.className = "recentmedals-row-allresults";
        }else{
            listItemContainer.className += " row-open";
        }
    })
}
