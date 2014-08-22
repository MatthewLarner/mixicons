#!/usr/bin/env node

var options = require('minimist')(process.argv.slice(2)),
    lex = require('parcss/lexer'),
    parse = require('parcss/parser'),
    kgo = require('kgo'),
    input = options.i || options.input ||  options._[0],
    output = options.o || options.output || options._[1],
    newFontPath = options.f || options.fontPath || options._[2],
    path = require('path'),
    fs = require('fs');

function isWordlike(type){
    return type === 'word' || type === 'color' || type === 'function';
}
function isParenthesisClose(type){
    return type === 'parenthesisClose';
}
function renderValue(tokens){
    var result = '';

    for(var i = 0; i < tokens.length; i++){
        var token = tokens[i];

        if(token.type === 'function') {
            var argumentSource = '';
            token.arguments.forEach(function(argument) {
                argumentSource += argument.source;
            });
            result += token.functionName + '(' + argumentSource + ')';
        } else {
            result += token.source;
        }


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
    return '@font-face {\n'+
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
        'icon(icon) {\n' +
        '    &:before{\n' +
        '        psuedoIcon(icon);\n' +
        '    }\n' +
        '}';
}

function render(ast) {
    var result = '';

    result += renderFontFaces(ast.fontFaces);

    result += '\n\n';

    result += renderCharCodes(ast.charCodes);

    result += '\n\n';

    result += renderSettings(ast.settings);

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

function processFontFace(fontFace) {

}

kgo
('css', function(done) {
    fs.readFile(input, done);
})
('parsed', ['css'], function(css, done) {
    done(null, parse(lex(css.toString())));
})
('converted', ['parsed'], function(ast, done) {
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

    done(null, {
        fontFaces: fontFaces,
        charCodes: charCodes,
        settings: settings
    });
})
('customised', ['converted'], function(ast, done) {
    if (newFontPath) {
        ast.fontFaces.forEach(function(fontFace) {
            fontFace.valueTokens.forEach(function(valueToken) {
                if(valueToken.type === 'function' && valueToken.functionName === 'url') {
                    var url = valueToken.arguments[0].source;
                        oldPath = path.dirname(url.slice(1, -1)),
                    valueToken.arguments[0].source = '"' + url.slice(1, -1).replace(oldPath, newFontPath) + '"';
                }
            });
        });
    }
    done(null, ast);
})
('rendered', ['customised'], function(ast, done) {
    done(null, render(ast));
})
(['rendered'], function(rendered, done){
    fs.writeFile(output, rendered, done);
});
