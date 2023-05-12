const messagingWrapper = {};

messagingWrapper.init = function(key) {

    loadScript("https://static.zdassets.com/ekr/snippet.js?key=" + key, function () {

        //events
        zE("messenger:on", "open", onOpen);
        zE("messenger:on", "close", onClose);

    });
}

export { messagingWrapper }

function loadScript(e,t){

    let n=document.createElement("script"); n.type="text/javascript",n.id="ze-snippet",n.readyState?n.onreadystatechange=function(){"loaded"!=n.readyState&&"complete"!=n.readyState||(n.onreadystatechange=null,t());}:n.onload=function(){t();},n.src=e,document.getElementsByTagName("head")[0].appendChild(n);}

async function onOpen() {

    //This needs to run delayed
    setTimeout(()=>{
        appendNewWidgetCSS(); // Append CSS
        changeButton(); // Change the close button
    },300);

    //remove traces in local storage
    await removeLocalStorageTraces();

    //get uniqueId
    let uniqueId = await getUniqueId();

    //if uniqueId exists, but polling has not started yet
    if(uniqueId) {
        await pollZendeskQueuingService();
    }

}

async function onClose() {

    let uniqueId = await getUniqueId();

    //localStorage.setItem(`${uniqueId}_endPolling`,'true');
    await autoSolveTicket(uniqueId);

    await removeLocalStorageTraces(uniqueId);

    await zE("messenger:set", "cookies", false);
    await zE("messenger:set", "cookies", true);
}

async function timer(unix,uniqueId) {

    //current time
    let currentUnix = Math.floor(new Date().getTime() / 1000);

    let timePassed  = currentUnix - unix;

    let timeLeft =  Math.floor(600 - timePassed);

    let minutes = Math.floor(timeLeft/60);
    let seconds = timeLeft - (60*minutes);

    let timeString = `${((minutes.toString().length === 1)?"0"+minutes:minutes)}:${((seconds.toString().length === 1)?"0"+seconds:seconds)}`;

    localStorage.setItem("queueTimer_" + uniqueId,timeString);

    addTimerToChatBubble(timeString);

    if(localStorage.getItem(`clientUnix_${uniqueId}`)) {
        setTimeout(()=>timer(unix,uniqueId),1000);
    }

}

async function removeLocalStorageTraces() {

    let storageObject = JSON.parse(JSON.stringify(localStorage));

    let searchString = ["queueTimer_","clientUnix_"];

    let toDelete = [];
    for(let key in storageObject) {

        searchString.forEach(function(string) {
            if(key.indexOf(string) > -1) {
                toDelete.push(key);
            }
        });
    }

    toDelete.forEach(function(i) {
        localStorage.removeItem(i);
    });
}

async function pollZendeskQueuingService() {

    let uniqueId = await getUniqueId();

    return new Promise( async function(resolve) {
        if (!uniqueId) resolve("no unique id!");

        let postData = {
            id: uniqueId,
            action: "statusCheck",
            clientUnix: localStorage.getItem(`clientUnix_${uniqueId}`)
        };

        let data = await $.ajax({
            type: "POST",
            url: "https://ej7az682s9.execute-api.eu-central-1.amazonaws.com/default/client_supervista_MessagingQueueService",
            data: JSON.stringify(postData),
        });

        data = JSON.parse(data);

        if(window.location.href.indexOf("localhost" > -1)) {
            console.log({data});

        }

        //start timer if we receive the clientUnix, but it is not set in storage yet
        if(data.hasOwnProperty("clientUnix") && !localStorage.getItem(`clientUnix_${uniqueId}`)) {
            localStorage.setItem(`clientUnix_${uniqueId}`, data.clientUnix);
            await timer(data.clientUnix,uniqueId);

        }
        switch (data.status) {

            // NO TICKET YET
            case "noTicket":
                setTimeout(async () => {
                    await pollZendeskQueuingService()
                }, 5000);
                break;

            // TICKET ASSIGNED
            case "ticketAssigned":
                appendChatBubble(data.message, false, uniqueId);
                setTimeout(async () => {
                    await pollZendeskQueuingService()
                }, 10000);
                break;

            // TICKET SOLVED
            case "ticketSolved":

                await removeLocalStorageTraces(uniqueId);
                appendChatBubble(data.message, false, uniqueId);

                break;

            // TICKET IN QUEUE
            default:
                appendChatBubble(data.message, true, uniqueId);
                setTimeout(async () => {
                    await pollZendeskQueuingService()
                }, 5000);
                break;
        }


        resolve ("Done!");

    });
}

function appendNewWidgetCSS() {

    let css = `
            button.newCloseButton {
                font-size: 23px;
                font-weight: 400;
                background-color: transparent;
                padding: 10px;
                border: 0;
                border-radius: 100px;
                width: 40px;
                height: 40px;
            }
            button.newCloseButton:hover {
                background-color: rgba(0, 0, 0, 0.08);
                color: rgb(0, 0, 0);
            }
            .popup {
                border-radius: 30px;
                border: 1px solid rgb(118, 184, 42);
                position: absolute;
                width: 80%;
                background-color: rgb(118, 184, 42);

                top: 50%;
                right: 50%;
                transform: translate(50%,-50%);
                padding: 20px;
                text-align:center;
                font-size: 0.875rem;
                    line-height: 1.25rem;
                    letter-spacing: -0.009375rem;
            }
            .popup div {
                width: 100px;
                cursor: pointer;
                display: inline-block;
                margin: 4px;
                background: white;
                border-radius: 10px;
                margin-top: 20px;
            }
            button[aria-label="Close"] {
                display:none;
            }
            .blur {
                    filter: blur(3px);
            }
            `;

    $('iframe[title="Messaging window"]').contents().find("head").append(`<style>${css}</style>`)

}

/* This function checks if the customer has been active by counting the change in chat-messages by going through the DOM */
function getInteractionCountFromClient() {

    let logElement = $('iframe[title="Messaging window"]').contents().find('div[role="log"]');

    let bubbleElement = $(logElement).find(".messageBubble");

    let counter = 0;
    let startCounter = false;
    $(logElement).children("div").each(function( index ) {

        if(startCounter) {
            counter++;
        }
        if($(this).hasClass("messageBubble")) {
            startCounter = true;
        }

    });

    return counter;
}

function addTimerToChatBubble(timestring) {

    $('iframe[title="Messaging window"]').contents().find(".timerData").text(timestring);

}


function changeButton() {

    let bodyElement = $('iframe[title="Messaging window"]').contents().find("body");

    let buttonElement = $('iframe[title="Messaging window"]').contents().find('button[aria-label="Close"]');

    let logElement = $('iframe[title="Messaging window"]').contents().find('div[role="log"]');

    $('<button class="newCloseButton">X</button>').insertAfter(buttonElement).click(function() {

        let that = this;

        $(this).prop("disabled",true);
        $(bodyElement).append(`<div class="popup"><p>Möchtest Du wirklich den Chat schließen? Wenn du den Chat schließt, verlierst du dieses Gesprächs</p><div class="confirm">Schließen</div><div class="cancel">Abbrechen</div></div>`);

        $(logElement).addClass("blur");

        $('iframe[title="Messaging window"]').contents().find(".confirm").click(function() {
            $(this).parent().remove();
            $(buttonElement).click();
            $(logElement).removeClass("blur");
            $(that).prop("disabled",false);
        });

        $('iframe[title="Messaging window"]').contents().find(".cancel").click(function() {
            $(this).parent().remove();
            $(logElement).removeClass("blur");
            $(that).prop("disabled",false);
        });

    });


    $(buttonElement).on("click", function(e) {

    });
}

/*
function hideBubble(uniqueId, actionCounter) {

    let savedActions =  localStorage.getItem("hideBubble_" + uniqueId);

    if(savedActions) {
        if(parseInt(savedActions) < actionCounter) {
            //hide bubble slowly
            let logElement = $('iframe[title="Messaging window"]').contents().find('div[role="log"]');
            let bubbleElement = $(logElement).find(".messageBubble");

            $(bubbleElement).fadeOut(3000);

        }
        else {
            return;
        }
    }
    else {
        localStorage.setItem("hideBubble_" + uniqueId,`${actionCounter}`);
    }
}
*/


function appendChatBubble(string, showTimer, uniqueId) {

    let timeString = localStorage.getItem("queueTimer_" + uniqueId);

    if(timeString && showTimer) {
        timeString = `Wir versuchen Dich innerhalb der nächsten 10 Minuten zu verbinden. Deine Wartezeit: <span class="timerData">${timeString}</span>`;
    }
    else {
        timeString = "";
    }

    let message = `<div style="background-color: #ffefc1; padding: 10px 10px;font-size: 14px; margin-block:20px" class="messageBubble"><p style="margin-bottom: 10px">${string}</p><p class="timerDiv">${timeString}</p></div>`;

    let logElement = $('iframe[title="Messaging window"]').contents().find('div[role="log"]');

    let bubbleElement = $(logElement).find(".messageBubble");

    if($(bubbleElement).length) {
        $(bubbleElement).replaceWith(message);
        $(logElement).scrollTop($(logElement)[0].scrollHeight);
        getInteractionCountFromClient();
        return;
    }

    let inserted = false;
    $(logElement).children("div").each(function( index ) {

        if($(this).css("display") !== "flex" && !inserted) {
            $(message).insertBefore($(this));
            inserted = true;
            $(logElement).scrollTop($(logElement)[0].scrollHeight);
            getInteractionCountFromClient();
        }


    });
}

async function autoSolveTicket(uniqueId) {

    if(!uniqueId) return;

    let postData = {
        id : uniqueId,
        action : "solveTicket",
        clientUnix: localStorage.getItem(`clientUnix_${uniqueId}`)
    };

    let data = await $.ajax({
        type: "POST",
        url: "https://ej7az682s9.execute-api.eu-central-1.amazonaws.com/default/client_supervista_MessagingQueueService",
        data: JSON.stringify(postData),
    });

    await zE("messenger:set", "cookies", false);
    await zE("messenger:set", "cookies", true);

}

async function getUniqueId() {
    return new Promise(function(resolve) {
        setTimeout(()=> {
            let storageObject = JSON.parse(JSON.stringify(localStorage));

            for(let key in storageObject) {
                if(key.indexOf(".appUserId") > -1) {
                    resolve(storageObject[key]);
                }
            }
        },1000);
    });
}
