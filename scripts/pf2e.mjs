import * as generic from './generic.mjs';

const damageEmoji = {
    "bludgeoning": ':hammer:',
    "slashing": ':axe:',
    "piercing": ':bow_and_arrow:',
    "acid": ':test_tube:',
    "cold": ':snowflake:',
    "electricity": ':zap:',
    "fire": ':fire:',
    "sonic": ':loud_sound:',
    "chaotic": ':cyclone:',
    "evil": ':smiling_imp:',
    "good": ':angel:',
    "lawful": ':scales:',
    "mental": ':brain:',
    "poison": ':biohazard:',
    "bleed": ':drop_of_blood:',
    "precision": 'dart',
    "negative": ':skull:',
    "void": ':skull:',
    "positive": ':sparkling_heart:',
    "vitality": ':sparkling_heart:',
    "force": ':sparkles:',
    "precision": ':dart:',
    "persistent": ':hourglass:',
    "splash": ':boom:'
}

export function messageParserPF2e(msg) {
    let constructedMessage = '';
    let hookEmbed = [];
    let cardType = 0;
    if ((generic.isCard(msg.content) && msg.rolls?.length < 1)) {
        cardType = 1;
    }
    else if (PF2e_isActionCard(msg.flavor) && msg.rolls?.length < 1) {
        cardType = 2;
    }
    if (game.modules.get('monks-tokenbar')?.active && generic.tokenBar_isTokenBarCard(msg.content)) {
        cardType = 0;
        hookEmbed = generic.tokenBar_createTokenBarCard(msg);
    }
    else if (cardType !== 0) {
        constructedMessage = "";
        if (getThisModuleSetting('sendEmbeds')) {
            hookEmbed = PF2e_createCardEmbed(msg, cardType);
        }
    }
    else if (!msg.isRoll) {
        /*Attempt polyglot support. This will ONLY work if the structure is similar:
        * for PF2e and DnD5e, this would be actor.system.traits.languages.value
        */
        if (game.modules.get("polyglot")?.active && generic.propertyExists(msg, "flags.polyglot.language")) {
            if (!getThisModuleSetting("commonLanguages").toLowerCase().includes(msg.flags.polyglot.language)) {
                if (getThisModuleSetting('includeOnly') == "") {
                    constructedMessage = generic.polyglotize(msg);
                }
                else {
                    listLanguages = getThisModuleSetting('includeOnly').split(",").map(item => item.trim().toLowerCase());
                    if (!listLanguages === null) {
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
        if (msg.flavor != null && msg.flavor.length > 0) {
            hookEmbed = PF2e_createRollEmbed(msg);
        }
        else {
            hookEmbed = generic.createGenericRollEmbed(msg);
        }
    }

    if (hookEmbed != [] && hookEmbed.length > 0) {
        if (/<[a-z][\s\S]*>/i.test(hookEmbed[0].title)) {
            hookEmbed[0].title = PF2e_reformatMessage(hookEmbed[0].title);
        }
        hookEmbed[0].description = PF2e_reformatMessage(hookEmbed[0].description);
        constructedMessage = (/<[a-z][\s\S]*>/i.test(msg.flavor) || msg.flavor === hookEmbed[0].title) ? "" : msg.flavor;
        //use anonymous behavior and replace instances of the token/actor's name in titles and descriptions
        //sadly, the anonymous module does this right before the message is displayed in foundry, so we have to parse it here.
        if (game.modules.get("anonymous")?.active) {
            for (let i = 0; i < hookEmbed.length; i++) {
                hookEmbed[i] = generic.anonymizeEmbed(msg, hookEmbed[i]);
            }
        }
    }
    constructedMessage = PF2e_reformatMessage(constructedMessage);
    return generic.getRequestParams(msg, constructedMessage, hookEmbed);
}

function PF2e_createCardEmbed(message, cardType) {
    let card = message.content;
    const parser = new DOMParser();
    //replace horizontal line tags with paragraphs so they can be parsed later
    card = card.replace(/<hr[^>]*>/g, "<p>-----------------------</p>");
    let doc = parser.parseFromString(card, "text/html");
    let desc = "";
    let title;
    // Find the <h3> element and extract its text content, since h3 works for most systems
    //generic card
    if (cardType === 1) {
        const h3Element = doc.querySelector("h3");
        title = h3Element.textContent.trim();
        desc = PF2e_parseTraits(message.content);
    }
    //pf2e action card, introduced in v5.4.0
    else if (cardType === 2) {
        const actionCardParser = new DOMParser();
        const actionDoc = actionCardParser.parseFromString(message.flavor, "text/html");
        const h4Element = actionDoc.querySelector("h4.action");
        title = h4Element.querySelector("strong").textContent;
        desc = PF2e_parseTraits(message.flavor);
    }
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
        if (cardType === 1) {
            let descList = doc.querySelectorAll(".card-content");
            descList.forEach(function (paragraph) {
                let text = paragraph.innerHTML
                desc += text + "\n\n";
            });
        }
        else if (cardType === 2) {
            desc += game.actors.get(message.speaker.actor).items.get(message.flags.pf2e.context.item).system.description.value
        }
    }

    return [{ title: title, description: desc, footer: { text: generic.getCardFooter(card) } }];
}

function PF2e_createRollEmbed(message) {
    let embed = []
    //Build Title
    const str = message.flavor;
    let regex = /<h4 class="action">(.*?)<\/h4>/g;
    let m;
    let title = "";
    while ((m = regex.exec(str)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        if (m[1] != null) {
            title = m[1];
        }
    }

    if (title == "") {
        regex = /<strong>(.*?)<\/strong>/g;
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            if (m[1] != null) {
                title = m[1];
            }
        }
    }

    if (game.modules.get("anonymous")?.active) {
        var anon = game.modules.get('anonymous').api; //optional implementation for "anonymous" module
    }

    let desc = "";

    //Build Description
    //Add targets to embed:
    if (game.modules.get("pf2e-target-damage")?.active) { //optional implementation for "pf2e-target-damage" module
        if (message.flags['pf2e-target-damage'].targets.length === 1) {
            desc = desc + "**:dart:Target: **";
        }
        else if (message.flags['pf2e-target-damage'].targets.length > 1) {
            desc = desc + "**:dart:Targets: **";
        }

        message.flags['pf2e-target-damage'].targets.forEach(target => {
            const curScene = game.scenes.get(message.speaker.scene);
            const curToken = curScene.tokens.get(target.id);
            if (game.modules.get("anonymous")?.active) {
                if (!anon.playersSeeName(curToken.actor)) {
                    desc = desc + "`" + anon.getName(curToken.actor) + "` ";
                }
                else {
                    desc = desc + "`" + curToken.name + "` ";
                }
            }
            else {
                desc = desc + "`" + curToken.name + "` ";
            }
        });
    }
    else {
        if (generic.propertyExists(message, "flags.pf2e.context.target.token")) {
            desc = desc + "**:dart:Target: **";
            const targetTokenId = message.flags.pf2e.context.target.token.split(".")[3];
            const targetToken = game.scenes.get(message.speaker.scene).tokens.get(targetTokenId);
            if (targetToken) {
                if (game.modules.get("anonymous")?.active) {
                    if (!anon.playersSeeName(targetToken.actor)) {
                        desc = desc + "`" + anon.getName(targetToken.actor) + "` ";
                    }
                    else {
                        desc = desc + "`" + targetToken.name + "` ";
                    }
                }
                else {
                    desc = desc + "`" + targetToken.name + "` ";
                }
            }
        }
    }
    desc = desc + "\n";

    if (!message.flags.pf2e.context.isReroll) {
        //Add roll information to embed:
        for (let i = 0; i < message.rolls.length; i++) {
            desc = desc + "**:game_die:Result: **" + "__**" + message.rolls[i].total + "**__";
            if (generic.propertyExists(message, "flags.pf2e.context.type") && message.flags.pf2e.context.type == "damage-roll") {
                if (title === "") {
                    title = "Damage Roll";
                }
                desc = desc + PF2e_parseDamageTypes(message.rolls[i]);
            }
            else if (PF2e_parseDegree(message.rolls[i].options.degreeOfSuccess) != "Invalid") {
                desc = desc + " `(" + PF2e_parseDegree(message.rolls[i].options.degreeOfSuccess) + ")`";
            }
            else if (PF2e_parseDegree(message.flags.pf2e.context.outcome) != "Invalid") {
                desc = desc + " `(" + PF2e_parseDegree(message.flags.pf2e.context.outcome) + ")`";
            }
            desc = desc + "\n";
        }
    }
    else {
        desc = desc + "~~:game_die:Result: " + "__" + PF2e_getDiscardedRoll(message) + "__~~\n";
        desc = desc + "**:game_die:Result: **" + "__**" + message.rolls[0].total + "**__";
        if (PF2e_parseDegree(message.flags.pf2e.context.outcome) != "Invalid") {
            desc = desc + " `(" + PF2e_parseDegree(message.flags.pf2e.context.outcome) + ")`";
        }
        desc = desc + "\n";
    }

    return [{ title: title, description: desc }];
}

function PF2e_parseDamageTypes(baserolls) {
    let damages = ""
    if (!baserolls.options.splashOnly) {
        baserolls.terms.forEach((term, i) => {
            term.rolls.forEach((roll, j) => {
                let precision = false;
                let splash = false;
                roll.terms.forEach((typeterm, k) => {
                    if (generic.propertyExists(typeterm, "term.options.flavor")) {
                        precision = typeterm.term.options.flavor == "precision";
                        splash = typeterm.term.options.flavor == "splash";
                    }

                });
                if (!roll.persistent) {
                    damages = damages + roll._total.toString();

                }
                else {
                    let persFormula = roll.formula;
                    const regex = /[^\d+d\d+\s*+-]/g;
                    persFormula = persFormula.replace(regex, '');
                    damages = damages + persFormula.trim();
                }
                damages = damages + (roll.persistent ? damageEmoji["persistent"] : "") + (precision ? damageEmoji["precision"] : "") + (splash ? damageEmoji["splash"] : "");
                if (!damageEmoji[roll.type]) {
                    damages = damages + "[" + roll.type + "]";
                }
                else {
                    damages = damages + damageEmoji[roll.type];
                }
                if (j != term.rolls.length - 1) {
                    damages = damages + " + ";
                }
            });
        });
    }
    else {
        baserolls.terms.forEach((term, i) => {
            term.rolls.forEach((roll, j) => {
                damages = damages + roll.total + damageEmoji["splash"];
                if (damageEmoji[roll.type]) {
                    damages = damages + damageEmoji[roll.type];
                }
                else {
                    damages = damages + "[" + roll.type + "]";
                }
            });
        });
    }
    return " ||**(" + damages + ")**||";
}

function PF2e_parseDegree(degree) {
    let convertedDegree
    switch (degree) {
        case "criticalFailure":
            convertedDegree = 0;
            break;
        case "failure":
            convertedDegree = 1;
            break;
        case "success":
            convertedDegree = 2;
            break;
        case "criticalSuccess":
            convertedDegree = 3;
            break;
        default:
            break;
    }
    switch (convertedDegree) {
        case 0:
            return "Critical Failure";
        case 1:
            return "Failure";
        case 2:
            return "Success";
        case 3:
            return "Critical Success";
        default:
            return "Invalid";
    }
}

function PF2e_getNameFromCheck(checkString) {
    return ":game_die:" + (function () {
        const check = generic.parseCheckString(checkString);
        let tempcheck = "`";
        if (check.showDC) {
            if (check.showDC === "all" || check.showdc === "all") {
                tempcheck = tempcheck + "DC " + check.dc + " ";
            }
        }
        if (check.type) {
            if (check.type === "flat") {
                return tempcheck + "Flat Check`";
            }
            let skillcheck = check.type.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
            if (check.basic) {
                return tempcheck + "Basic " + skillcheck + "`";
            }
            else {
                return tempcheck + skillcheck + "`";
            }
        }
    })();
}

function PF2e_replaceDamageFormat(damagestring) {
    const regex = /@Damage\[(\d+d\d+\[[^\]]+\](?:, ?)?)+\]/g;
    return damagestring.replace(regex, (match) => {
        const diceParts = match.match(/\d+d\d+\[[^\]]+\]/g);
        const formattedDice = diceParts.map(part => {
            const [dice, desc] = part.match(/(\d+d\d+)\[([^\]]+)\]/).slice(1);
            return `${dice} ${desc}`;
        }).join(' + ');
        return `\:game_die: \`${formattedDice}\` `;
    });
}

function PF2e_parseTraits(text) {
    let displayTraits = true;
    //check if anonymous allows traits to be displayed
    if (game.modules.get("anonymous")?.active) {
        if (game.settings.get("anonymous", "pf2e.traits")) {
            if (game.settings.get("anonymous", "pf2e.traits") !== "never") {
                displayTraits = false;
            }
        }
    }
    let traits = "";
    if (displayTraits) {
        const card = text;
        const parser = new DOMParser();
        let doc = parser.parseFromString(card, "text/html");
        let tags;
        let tagsSection = doc.querySelector(".item-properties.tags");
        try {
            tags = Array.from(tagsSection.querySelectorAll(".tag")).map(tag => tag.textContent);
        }
        catch (error) {
            try {
                tagsSection = doc.querySelector('.tags');
                tags = Array.from(tagsSection.querySelectorAll(".tag")).map(tag => tag.textContent);
            }
            catch (error) {
            }
        }
        if (generic.propertyExists(tags, "length")) {

            for (let i = 0; i < tags.length; i++) {
                traits = traits + "[" + tags[i] + "] ";
            }
        }
    }
    if (traits.trim() !== "") {
        return "`" + traits.trim() + "`\n";
    }
    else {
        return "";
    }
}

function PF2e_reformatMessage(text) {
    let reformattedText = ""
    //First check if the text is formatted in HTML to use a different function
    //parse Localize first, since it will have html elements
    let regex = /@Localize\[(.*?)\]/g;
    reformattedText = text.replace(regex, (_, text) => generic.getLocalizedText(text));
    const isHtmlFormatted = /<[a-z][\s\S]*>/i.test(reformattedText);
    if (isHtmlFormatted) {
        reformattedText = PF2e_parseHTMLText(reformattedText);
        reformattedText = PF2e_reformatMessage(reformattedText); //call this function again as a failsafe for @ tags
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

        //replace @Damage appropriately (for PF2e)
        reformattedText = PF2e_replaceDamageFormat(reformattedText);

        //replace UUID if custom name is not present (redundancy)
        regex = /@UUID\[(.*?)\]/g;
        reformattedText = reformattedText.replace(regex, (_, text) => generic.getNameFromItem(text));

        //replace Actor if custom name is not present (redundancy)
        regex = /@Actor\[(.*?)\]/g;
        reformattedText = reformattedText.replace(regex, (_, text) => {
            return ':bust_in_silhouette: `' + game.actors.get(text).name + '`';
        });

        //replace Checks
        regex = /@Check\[[^\]]+\]{([^}]+)}/g;
        reformattedText = reformattedText.replace(regex, ':game_die: `$1`');

        //replace checks without name labels, different arguments on every system for @Check(if it exists), so pf2e gets a different one
        regex = /@Check\[(.*?)\]/g;
        reformattedText = reformattedText.replace(regex, (_, text) => PF2e_getNameFromCheck(text));
    }

    return reformattedText.trim();
}

function PF2e_isActionCard(flavor) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(flavor, "text/html");
    const action = doc.querySelectorAll("h4.action");
    if (action.length > 0) {
        return true;
    }
    else {
        return false;
    }
}

function PF2e_parseHTMLText(htmlString) {
    let reformattedText = htmlString;

    // Cleanup newlines in raw text before parsing
    reformattedText = reformattedText.replace(/<[^>]*>[^<]*\n[^<]*<\/[^>]*>/g, match => match.replace(/\n/g, ''));

    const htmldoc = document.createElement('div');
    htmldoc.innerHTML = reformattedText;

    // Remove elements with data-visibility attribute and hidden styles
    ['[data-visibility="gm"]', '[data-visibility="owner"]', '[style*="display:none"]'].forEach(selector => {
        const elements = htmldoc.querySelectorAll(selector);
        elements.forEach(element => element.parentNode.removeChild(element));
    });
    // Remove <img> tags
    generic.removeElementsBySelector('img', htmldoc);
    // Format various elements
    generic.formatTextBySelector('.inline-roll, .inline-check, span[data-pf2-check]', text => `:game_die:\`${text}\``, htmldoc);
    reformattedText = htmldoc.innerHTML;
    // Status effect cards
    const statuseffectlist = htmldoc.querySelectorAll('.statuseffect-rules');
    if (statuseffectlist.length !== 0) {
        let statfx = '';
        statuseffectlist.forEach(effect => {
            statfx += effect.innerHTML.replace(/<p>.*?<\/p>/g, '') + '\n';
        });
        const tempdivs = document.createElement('div');
        tempdivs.innerHTML = reformattedText;
        const targetdiv = tempdivs.querySelector('.dice-total.statuseffect-message');
        if (targetdiv) {
            targetdiv.innerHTML = statfx;
        }
        generic.removeElementsBySelector('.dice-total.statuseffect-message ul', tempdivs);
        reformattedText = tempdivs.innerHTML;
    }

    // Format header, strong, and em tags
    reformattedText = generic.htmlCodeCleanup(reformattedText);

    return reformattedText;
}

function PF2e_getDiscardedRoll(message) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message.content, "text/html");
    const rerollDiscardDiv = doc.querySelector(".pf2e-reroll-discard .dice-total");
    return rerollDiscardDiv.textContent;
}

function getThisModuleSetting(settingName) {
    return game.settings.get('foundrytodiscord', settingName);
}
