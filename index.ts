import * as parserBabel from '@babel/parser'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const prettier = require('prettier')

let tmp = ''
let imports = ''

const replacerFunc = () => {
  const visited = new WeakSet()
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (visited.has(value)) {
        return
      }
      visited.add(value)
    }

    const importWrapper = (value: any) => {
      const str =
        value?.moduleSpecifier?.parent?.statements ??
        value?.importClause?.name?.escapedText ??
        value?.importClause?.namedBindings?.elements?.[0].name?.escapedText

      return value?.importClause?.namedBindings
        ? `import { ${str} } from '${value?.moduleSpecifier?.text}'`
        : str
        ? `import ${str} from '${value?.moduleSpecifier?.text}'`
        : `import '${value?.moduleSpecifier?.text}'`
    }

    const getData = () => {
      if (Boolean(value) && value.kind === ts.SyntaxKind.ImportDeclaration) {
        // if (value?.moduleSpecifier?.text === '../hooks/useSearchData') {
        //   console.log('########## value', value)
        // }
        return importWrapper(value)
      }
      if ([ts.SyntaxKind.JsxOpeningElement].includes(value.kind)) {
        return '<' + value.tagName.escapedText + '>' || 'nope'
      }
      if ([ts.SyntaxKind.JsxSelfClosingElement].includes(value.kind)) {
        return '<' + value.tagName.escapedText + ' />' || 'nope'
      }
      if ([ts.SyntaxKind.JsxClosingElement].includes(value.kind)) {
        return '</ ' + value.tagName.escapedText + '>' || ''
      }
      return null
    }

    return getData()
  }
}

export function delint(sourceFile: ts.SourceFile) {
  delintNode(sourceFile)

  function delintNode(node: ts.Node) {
    if (
      [
        ts.SyntaxKind.JsxOpeningElement,
        ts.SyntaxKind.JsxSelfClosingElement,
        ts.SyntaxKind.JsxClosingElement,
        ts.SyntaxKind.ImportDeclaration,
      ].includes(node.kind)
    ) {
      if (node.kind === ts.SyntaxKind.ImportDeclaration) {
        imports =
          imports + (replacerFunc()('', node) || '').replace(/"/g, '') + '\r\n'
      } else {
        tmp =
          tmp +
          '\r\n\r\n' +
          JSON.stringify(node, replacerFunc()).replace(/"/g, '') +
          '\r\n\r\n'
      }
    } else {
      ts.forEachChild(node, delintNode)
    }
  }
}

const getAllFiles = function (dirPath: string, arrayOfFiles: Array<any>) {
  const files = fs.readdirSync(dirPath)
  let newArrayOfFiles = arrayOfFiles || []

  files.forEach(function (file) {
    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + '/' + file, newArrayOfFiles)
    } else {
      arrayOfFiles.push(path.join('', dirPath, '/', file))
    }
  })

  return arrayOfFiles
}

const appendData = () => {
  tmp.length &&
    fs.appendFileSync(
      'report.js',
      imports +
        '\r\n' +
        prettier.format('<>' + tmp.trim() + '</>', {
          parser: 'babel',
          plugins: [parserBabel],
          languages: 'jsx',
        }) +
        '\r\n'
    )
  imports = ''
  tmp = ''
}

const url = process.argv.slice(2)[0]
fs.unlinkSync('./report.js')

getAllFiles(url, []).forEach(fileName => {
  if (path.extname(fileName) === '.js') {
    const sourceFile = ts.createSourceFile(
      fileName,
      fs.readFileSync(fileName).toString(),
      ts.ScriptTarget.ES2015,
      /*setParentNodes */ true
    )

    tmp = ''
    fs.appendFileSync(
      'report.js',
      '// FILE: ' + sourceFile.fileName + '\r\n\r\n'
    )
    delint(sourceFile)
    appendData()
  }
})
