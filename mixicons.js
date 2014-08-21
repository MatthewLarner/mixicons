#!/usr/bin/env node

var options = require('minimist')(process.argv.slice(2)),
    lex = require('parcss/lexer'),
    parse = require('parcss/parser'),
    kgo = require('kgo'),
    input = options.i || options.input ||  options._[0],
    output = options.o || options.output || options._[1],
    fs = require('fs');

function isWordlike(type){
    return type === 'word' || type === 'color';
}
function isParenthesisClose(type){
    return type === 'parenthesisClose';
}
function renderValue(tokens){
    var result = '';

    for(var i = 0; i < tokens.length; i++){
        var token = tokens[i];

        result += token.source;

        if(i === tokens.length -1){
            continue;
        }

        if(
            isParenthesisClose(token.type) ||
            (isWordlike(token.type) && isWordlike(tokens[i+1].type))
        ){
            result += ' ';
        }
    }

    return result;
}

function renderStatement(result, statement){
    return result + '    ' + statement.property + ': ' + renderValue(statement.valueTokens) + ';\n';
}

function renderFontFaces(fontFaces){
    return 'iconFont(){\n'+
        fontFaces.reduce(renderStatement, '') +
        '}';
}

function renderCharCode(result, charCode) {
    return result + charCode.name + ' = ' + charCode.character + ';\n';
}


function renderCharCodes(charCodes) {
    return charCodes.reduce(renderCharCode, '');
}

function renderSettings(settings){
    return 'iconStyle(){\n'+
        settings.reduce(renderStatement, '') +
        '}';
}

function renderMixings() {
    return '' +
        'psuedoIcon(icon) {\n' +
        '    iconStyle();\n' +
        '    content: icon;\n' +
        '}\n' +
        'icon(icon, location=before) {\n' +
        '    &:location{\n' +
        '        psuedoIcon(icon);\n' +
        '    }\n' +
        '}';
}

function render(fontFaces, charCodes, settings) {
    var result = '';

    result += renderFontFaces(fontFaces);

    result += '\n\n';

    result += renderCharCodes(charCodes);

    result += '\n\n';

    result += renderSettings(settings);

    result += '\n\n';

    result += renderMixings();

    return result;
}

function convertIconSelector(block) {
    var iconMatch = block.selectors[0].match(/^\.icon-(.*):before$/);

    if (iconMatch) {
        var charCode = {
                character: block.content[0].valueTokens[0].source,
                name: iconMatch[1]
            };
        return charCode;
    }
}
function convertDataSelector(block) {
    if (block.selectors[0] === '[data-icon]:before') {
        return block.content;
    }
}

kgo
('css', function(done) {
    fs.readFile(input, done);
})
('parsed', ['css'], function(css, done) {
    done(null, parse(lex(css.toString())));
})
('rendered', ['parsed'], function(ast, done) {
    var fontFaces,
        charCodes = [],
        settings;

    ast.forEach(function(rule) {
        if (rule.type !== 'block') {
            return;
        }

        if (rule.kind === 'font-face') {
            fontFaces = rule.content;
        } else if(rule.selectors) {
            var character = convertIconSelector(rule);
            if(character){
                charCodes.push(character);
                return;
            }

            var iconSettings = convertDataSelector(rule);
            if(iconSettings){
                settings = iconSettings;
            }
        }

    });

    done(null, render(fontFaces, charCodes, settings));
})
(['rendered'], function(rendered, done){
    fs.writeFile(output, rendered, done);
});
