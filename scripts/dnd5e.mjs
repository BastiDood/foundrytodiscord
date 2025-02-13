import * as generic from './generic.mjs';

export function messageParserDnD5e(msg) {
    let constructedMessage = '';
    let hookEmbed = [];
    if (game.modules.get('midi-qol')?.active && midiqol_isMergeCard(msg.content)) {
        hookEmbed = midiqol_createMergeCard(msg);
    }
    else if(game.modules.get('monks-tokenbar')?.active && generic.tokenBar_isTokenBarCard(msg.content)){
        hookEmbed = generic.tokenBar_createTokenBarCard(msg);
    }
    else if (generic.isCard(msg.content) && msg.rolls?.length < 1) {
        constructedMessage = "";
        if (getThisModuleSetting('sendEmbeds')) {
            hookEmbed = DnD5e_createCardEmbed(msg);
        }
    }
    else if (!msg.isRoll) {
        /*Attempt polyglot support. This will ONLY work if the structure is similar:
        * for PF2e and DnD5e, this would be actor.system.traits.languages.value
        * polyglotize() can be edited for other systems.
        */
        if (game.modules.get("polyglot")?.active && generic.propertyExists(msg, "flags.polyglot.language")) {
            if (!getThisModuleSetting("commonLanguages").toLowerCase().includes(msg.flags.polyglot.language)) {
                if (getThisModuleSetting('includeOnly') == "") {
                    constructedMessage = generic.polyglotize(msg);
                }
                else {
                    listLanguages = getThisModuleSetting('includeOnly').split(",").map(item => item.trim().toLowerCase());
                    if (!listLanguages == null) {
                        listLanguages = [];
                    }
                    constructedMessage = generic.polyglotize(msg, listLanguages);
                }
            }
        }
        if (constructedMessage == '') {
            constructedMessage = msg.content;
        }
    }
    else {
        hookEmbed = generic.createGenericRollEmbed(msg);
    }

    if (hookEmbed != [] && hookEmbed.length > 0) {
        hookEmbed[0].description = DnD5e_reformatMessage(hookEmbed[0].description);
        constructedMessage = (/<[a-z][\s\S]*>/i.test(msg.flavor) || msg.flavor === hookEmbed[0].title) ? "" : msg.flavor;
        //use anonymous behavior and replace instances of the token/actor's name in titles and descriptions
        //sadly, the anonymous module does this right before the message is displayed in foundry, so we have to parse it here.
        if (game.modules.get("anonymous")?.active) {
            for (let i = 0; i < hookEmbed.length; i++) {
                hookEmbed[i] = generic.anonymizeEmbed(msg, hookEmbed[i]);
            }
        }
    }
    constructedMessage = DnD5e_reformatMessage(constructedMessage);
    return generic.getRequestParams(msg, constructedMessage, hookEmbed);
}
function DnD5e_createCardEmbed(message) {
    let card = message.content;
    const parser = new DOMParser();
    //replace horizontal line tags with paragraphs so they can be parsed later when DnD5e_reformatMessage is called
    card = card.replace(/<hr[^>]*>/g, "<p>-----------------------</p>");
    let regex = /<[^>]*>[^<]*\n[^<]*<\/[^>]*>/g; //html cleanup, removing unnecessary blank spaces and newlines
    card = card.replace(regex, (match) => match.replace(/\n/g, ''));
    let doc = parser.parseFromString(card, "text/html");
    const h3Element = doc.querySelector("h3");
    let title;
    if (h3Element?.textContent) {
        title = h3Element.textContent.trim();
    }
    else {
        //Use first line of plaintext to title the embed instead
        const strippedContent = card.replace(/<[^>]+>/g, ' ').trim(); // Replace HTML tags with spaces
        const lines = strippedContent.split('\n'); // Split by newline characters
        title = lines[0].trim(); // Get the first line of plain text
        const regex = new RegExp('\\b' + title + '\\b', 'i');
        card = card.replace(regex, "");

    }
    let desc = "";
    let speakerActor = undefined;
    if (generic.propertyExists(message, "speaker.actor")) {
        speakerActor = game.actors.get(message.speaker.actor);
    }

    //parse card description if source is from a character or actor is owned by a player
    //this is to limit metagame information and is recommended for most systems.
    let descVisible = getThisModuleSetting('showDescription');
    if (speakerActor) {
        if (game.modules.get("anonymous")?.active && !generic.isOwnedByPlayer(speakerActor)) {
            descVisible = false;
        }
    }
    if (descVisible) {
        let descList = doc.querySelectorAll(".card-content");
        descList.forEach(function (paragraph) {
            let text = paragraph.innerHTML;
            desc += text + "\n\n";
        });
    }

    return [{ title: title, description: desc, footer: { text: generic.getCardFooter(card) } }];
}

function getThisModuleSetting(settingName) {
    return game.settings.get('foundrytodiscord', settingName);
}

function DnD5e_reformatMessage(text) {
    let reformattedText = ""
    //First check if the text is formatted in HTML to use a different function
    //parse Localize first, since it will have html elements
    let regex = /@Localize\[(.*?)\]/g;
    reformattedText = text.replace(regex, (_, text) => generic.getLocalizedText(text));
    const isHtmlFormatted = /<[a-z][\s\S]*>/i.test(reformattedText);
    if (isHtmlFormatted) {
        reformattedText = generic.parseHTMLText(reformattedText);
        reformattedText = DnD5e_reformatMessage(reformattedText); //call this function again as a failsafe for @ tags
    }
    else {
        //replace UUIDs to be consistent with Foundry
        regex = /@UUID\[[^\]]+\]\{([^}]+)\}/g;
        reformattedText = reformattedText.replace(regex, ':baggage_claim: `$1`');

        //replace Actor
        regex = /@Actor\[[^\]]+\]\{([^}]+)\}/g;
        reformattedText = reformattedText.replace(regex, ':bust_in_silhouette: `$1`');

        //replace compendium links
        regex = /@Compendium\[[^\]]+\]\{([^}]+)\}/g;
        reformattedText = reformattedText.replace(regex, ':baggage_claim: `$1`');

        //replace UUID if custom name "{}" is not present (redundancy)
        regex = /@UUID\[(.*?)\]/g;
        reformattedText = reformattedText.replace(regex, (_, text) => generic.getNameFromItem(text));

        //replace Actor if custom name "{}" is not present (redundancy)
        regex = /@Actor\[(.*?)\]/g;
        reformattedText = reformattedText.replace(regex, (_, text) => {
            return ':bust_in_silhouette: `' + game.actors.get(text).name + '`';
        });

        /*  FOR DND: USE SAME METHOD AS ABOVE FOR REPLACING @ TAGS, such as @Actor[]{}, etc.
        *   Not sure what 5e uses.
        */
    }

    return reformattedText;
}

function midiqol_createMergeCard(message) {
    let embeds = DnD5e_createCardEmbed(message);
    const divs = document.createElement('div');
    divs.innerHTML = message.content;
    let attackTitle = "";
    let damageTitle = "";
    let element = divs.querySelector('.midi-qol-attack-roll');
    let fields = [];
    if (element) {
        attackTitle = element.querySelector('div').textContent;
        if (attackTitle && attackTitle !== "") {
            const total = element.querySelector('h4.dice-total');
            let result = total.textContent;
            let rollValue = "";
            if (result) {
                switch (game.settings.get('midi-qol', 'ConfigSettings').hideRollDetails) {
                    case 'none':
                    case 'detailsDSN':
                    case 'details':
                        if (result !== "") {
                            rollValue = ":game_die:**Result: __" + result + "__";
                        }
                        break;
                    case 'd20Only':
                    case 'd20AttackOnly':
                        rollValue = ":game_die:**(d20) __" + message.flags['midi-qol'].d20AttackRoll + "__";
                        break;
                    case 'hitDamage':
                    case 'hitCriticalDamage':
                        if (message.flags['midi-qol'].isHit) {
                            rollValue = "**__Hits__"
                        }
                        else {
                            rollValue = "**__Misses__"
                        }
                        break;
                    case 'all':
                        rollValue = ':game_die:**Rolled';
                        break;
                }
                if (['none', 'detailsDSN', 'details', 'hitCriticalDamage', 'd20Only', 'd20AttackOnly'].includes(game.settings.get('midi-qol', 'ConfigSettings').hideRollDetails)) {
                    if (message.flags['midi-qol'].isCritical) {
                        rollValue += " (Critical!)**";
                    }
                    else if (message.flags['midi-qol'].isFumble) {
                        rollValue += " (Fumble!)**";
                    }
                    else {
                        rollValue += "**";
                    }
                }
                else {
                    rollValue += "**";
                }
                fields.push({ name: attackTitle, value: rollValue, inline: true })
            }
        }
    }
    element = divs.querySelector('.midi-qol-damage-roll');
    if (element) {
        damageTitle = element.querySelector('div').textContent;
        if (damageTitle && damageTitle !== "") {
            let rollValue = "";
            rollValue = element.querySelector('h4.dice-total').textContent;
            if (rollValue !== "" && ['all', 'd20AttackOnly'].includes(game.settings.get('midi-qol', 'ConfigSettings').hideRollDetails)) {
                rollValue = "Rolled";
            }
            else {
                rollValue = ":game_die:**Result: __" + rollValue + "__**";
            }
            fields.push({ name: damageTitle, value: rollValue, inline: true })
        }
    }
    embeds = [{
        title: embeds[0].title,
        description: embeds[0].description,
        fields: fields,
        footer: embeds[0].footer
    }];
    divs.innerHTML = message.content.replace(/>\s+</g, '><');
    element = divs.querySelector('.midi-qol-saves-display');
    let title = "";
    let desc = "";
    if (element) {
        if (element.textContent !== "" && game.settings.get('midi-qol', 'ConfigSettings').displaySaveDC) {
            title = element.querySelector(".midi-qol-nobox.midi-qol-bigger-text");
        }
        if (game.settings.get('midi-qol', 'ConfigSettings').autoCheckSaves !== 'whisper') {
            element.querySelectorAll('.midi-qol-flex-container').forEach(container => {
                let parsedTarget = "";
                const target = container.querySelector('.midi-qol-target-npc-Player.midi-qol-target-name');
                if (target) {
                    parsedTarget += target.textContent + " ";
                }
                const label = container.querySelector('label')?.textContent;
                if (label) {
                    parsedTarget += label + " ";
                }
                if (game.settings.get('midi-qol', 'ConfigSettings').autoCheckSaves !== 'allNoRoll') {
                    const savetotal = container.querySelector('.midi-qol-tooltip.midi-qol-save-total')
                    if (savetotal) {
                        parsedTarget += ": " + ":game_die: **__" + savetotal.firstChild.textContent.split(" ")[1] + "__**";
                    }
                }
                parsedTarget = parsedTarget.replace(/\s+/g, ' ').trim();
                desc += parsedTarget + "\n";
            });
            if (title) {
                embeds.push({ title: title ? generic.parseHTMLText(title.innerHTML) : "", description: desc });
            }
            else if (desc !== "") {
                embeds.push({ description: desc })
            }
            return embeds;
        }
    }
    element = divs.querySelector('.midi-qol-hits-display');
    if (element && game.settings.get('midi-qol', 'ConfigSettings').autoCheckHit === 'all') {
        element.querySelectorAll('.midi-qol-flex-container').forEach(container => {
            let parsedTarget = "";
            const result = container.querySelector('strong');
            if (result) {
                parsedTarget += "**" + result.textContent + "** ";
            }
            const target = container.querySelector('.midi-qol-target-npc-Player.midi-qol-target-name');
            if (target) {
                parsedTarget += target.textContent + " ";
            }
            parsedTarget = parsedTarget.replace(/\s+/g, ' ').trim();
            desc += parsedTarget + "\n";
        });
        if (title) {
            embeds.push({ title: title ? generic.parseHTMLText(title.innerHTML) : "", description: desc });
        }
        else if (desc !== "") {
            embeds.push({ description: desc })
        }
        return embeds;
    }
    return embeds;
}

function midiqol_isMergeCard(htmlString) {
    const tempElement = document.createElement('div');
    tempElement.innerHTML = htmlString;
    const midiQOLItemCard = tempElement.querySelector('.midi-qol-item-card');
    if (midiQOLItemCard) {
        return true;
    } else {
        return false;
    }
}