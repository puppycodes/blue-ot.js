/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'
import { map, zip } from 'wu'

import { shuffle, push, concat } from './utils.js'

import type {
  Client,
  Server,
  ClientRequest,
  ServerRequest
} from './orchestrator.js'

import type {
  SimpleTextOperation,
  TextState
} from './text_operations.js'

import {
  generatePropogator,
  generateClient,
  generateServer,
  Orchestrator
} from './orchestrator.js'

import {
  retainFactory,
  generateInsertion,
  generateDeletion,
  SuboperationsTransformer,
  SimpleTextApplier
} from './text_operations.js'

let FAKE_STATE = 'xyz'

let transformer = new SuboperationsTransformer(retainFactory)
let applier = new SimpleTextApplier()
let orchestrator = new Orchestrator(transformer, applier)

describe('local operation => remote operation => loop', () => {
  it ('client updates client', () => {
    let client = generateClient('')
    orchestrator.clientLocalOperation(client, generateInsertion(0, 'hello!'))

    assert.equal('hello!', client.state)
  })
  it ('client updates server & client', () => {
    let client = generateClient('')
    let server = generateServer('')

    let propogate = generatePropogator(orchestrator, server, [client])

    propogate(orchestrator.clientLocalOperation(client, generateInsertion(0, 'hello!')))

    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state)
  })
  it ('two clients are handled', () => {
    let client0 = generateClient('')
    let client1 = generateClient('')
    let server = generateServer('')

    let propogate = generatePropogator(orchestrator, server, [client0, client1])

    propogate(orchestrator.clientLocalOperation(client1, generateInsertion(0, 'world')))
    propogate(orchestrator.clientLocalOperation(client0, generateInsertion(0, 'hello')))

    assert.equal('helloworld', client0.state)
    assert.equal('helloworld', client1.state)
    assert.equal('helloworld', server.state)
  })
  it ('two clients out of order', () => {
    let client0 = generateClient('')
    let client1 = generateClient('')
    let server = generateServer('')

    let propogate = generatePropogator(orchestrator, server, [client0, client1])

    let c1 = orchestrator.clientLocalOperation(client1, generateInsertion(0, '01234'))
    let c2a = orchestrator.clientLocalOperation(client0, generateInsertion(0, 'abc'))
    let c2b = orchestrator.clientLocalOperation(client0, generateDeletion(0, 3))

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.state)
    assert.equal('01234', client1.state)
    assert.equal('01234', server.state)
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = generateClient('')
    let client1 = generateClient('')
    let client2 = generateClient('')

    let clients = [client0, client1, client2]
    let server = generateServer('')

    let propogate = generatePropogator(orchestrator, server, clients)

    let request0 = orchestrator.clientLocalOperation(client0, generateInsertion(0, 'hello'))
    let request1 = orchestrator.clientLocalOperation(client0, generateDeletion(2, 3)) // he

    let request2 = orchestrator.clientLocalOperation(client1, generateInsertion(0, 'dog'))
    let request3 = orchestrator.clientLocalOperation(client1, generateDeletion(0, 1))
    let request4 = orchestrator.clientLocalOperation(client1, generateInsertion(0, 'g'))
    let request5 = orchestrator.clientLocalOperation(client1, generateDeletion(2, 1))

    let request6 = orchestrator.clientLocalOperation(client1, generateInsertion(2, 'd')) // god
    let request7 = orchestrator.clientLocalOperation(client2, generateInsertion(0, 'le'))
    let request8 = orchestrator.clientLocalOperation(client2, generateInsertion(2, ' sigh')) // le sigh

    assert.equal('he', client0.state)
    assert.equal('god', client1.state)
    assert.equal('le sigh', client2.state)
    assert.equal('', server.state)

    propogate(request0)
    propogate(request2)
    propogate(request6)
    propogate(request1)
    propogate(request3)
    propogate(request7)
    propogate(request8)
    propogate(request4)
    propogate(request5)

    assert.equal('le sighgodhe', client0.state)
    assert.equal('le sighgodhe', client1.state)
    assert.equal('le sighgodhe', client2.state)
    assert.equal('le sighgodhe', server.state)
  })
})
