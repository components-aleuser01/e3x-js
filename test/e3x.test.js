var expect = require('chai').expect;
var e3x = require('../index.js');
var lob = require('lob-enc');

// convenience for handling buffer fixtures
function b2h(o)
{
  Object.keys(o).forEach(function(k){
    o[k] = o[k].toString('hex');
  });
  return o;
}
function h2b(o)
{
  Object.keys(o).forEach(function(k){
    o[k] = new Buffer(o[k],'hex');
  });
  return o;
}

describe('e3x', function(){

  // fixtures
  var pairsA = {"1a":h2b({"key":"03a3c4c9f6e081706be52903c75e077f0f3264eda1","secret":"12d2af807dd9cf8e3f99df395fac08dede4de913"})};
  var pairsB = {"1a":h2b({"key":"03fef52613c4dad0614d92cb7331d3e64658e0b8ba","secret":"a1e95d6a1bb247183b2f52f97c174a9fb39905d9"})};
  var handshakeAB = lob.decode(new Buffer('00011a5402002d03ad284810d9a0ce5194b8ead5e08a43e84c84b1a8aa13724c52660c34ad7e977b158b24b26571b53ed5dd6babe0d632','hex'));
  var handshakeBA = lob.decode(new Buffer('00011a5402002d031b53524a276381f39453e441fd4f576b9b851b2a7c9c38fbd0a1221c9ef13255895013fb77f2609574f78f3d79e07b','hex'));

  it('should export an object', function(){
    expect(e3x).to.be.a('object');
  });

  it('should have cipher sets loaded', function(){
    expect(Object.keys(e3x.cs).length).to.be.equal(1);
  });

  it('generates keys', function(done){
    e3x.generate(function(err,pairs){
      expect(err).to.not.exist;
      expect(pairs).to.be.an('object');
      expect(Object.keys(pairs).length).to.be.above(0);
      expect(pairs['1a'].key.length).to.be.equal(21);
      expect(pairs['1a'].secret.length).to.be.equal(20);
//      console.log("GEN",JSON.stringify({'1a':b2h(pairs['1a'])}));
      done();
    });
  });

  it('loads self', function(){
    var self = e3x.self({pairs:pairsA});
    expect(e3x.err).to.not.exist;
    expect(self).to.be.an('object');
    expect(self.decrypt).to.be.a('function');
    expect(self.exchange).to.be.a('function');
  });

  it('creats an exchange', function(){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    expect(self.err).to.not.exist;
    expect(x).to.be.an('object');
    expect(x.id).to.be.a('string');
    expect(x.decrypt).to.be.a('function');
    expect(x.channel).to.be.a('function');
    expect(x.token.length).to.be.equal(16);
    expect(x.order).to.be.equal(2);
  });

  it('generates a handshake', function(){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    var handshake = x.handshake();
//     console.log('handshakeAB',handshake.toString('hex'));
    expect(handshake).to.be.an('object');
    expect(handshake.length).to.be.equal(55);
  });

  it('generates another handshake', function(){
    var self = e3x.self({pairs:pairsB});
    var x = self.exchange({csid:'1a',key:pairsA['1a'].key});
    var handshake = x.handshake();
//      console.log('handshakeBA',handshake.toString('hex'));
    expect(handshake).to.be.an('object');
    expect(handshake.length).to.be.equal(55);
  });

  it('decode a handshake', function(){
    var self = e3x.self({pairs:pairsB});
    var inner = self.decrypt(handshakeAB);
    expect(inner).to.be.an('object');
    expect(inner.body.length).to.be.equal(21);
  });

  it('not decode a handshake', function(){
    var self = e3x.self({pairs:pairsA});
    var inner = self.decrypt(handshakeAB);
    expect(inner).to.not.exist;
  });

  it('verify a handshake', function(){
    var self = e3x.self({pairs:pairsB});
    var inner = self.decrypt(handshakeAB);
    var x = self.exchange({csid:'1a',key:inner.body});
    var c = x.verify(handshakeAB);
    expect(c).to.be.true;
  });

  it('require sync from a handshake', function(){
    var self = e3x.self({pairs:pairsB});
    var inner = self.decrypt(handshakeAB);
    var x = self.exchange({csid:'1a',key:inner.body});
    var bool = x.sync(handshakeAB);
    expect(bool).to.be.above(0);
  });

  it('be in sync from a handshake', function(){
    var self = e3x.self({pairs:pairsB});
    var inner = self.decrypt(handshakeAB);
    var x = self.exchange({csid:'1a',key:inner.body});
    x.seq = 1409417261; // force this so that it tests accepting the handshake
    var bool = x.sync(handshakeAB);
    expect(bool).to.be.equal(0);
  });

  it('creates an unreliable channel', function(){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    x.sync(handshakeBA);
    var cid = x.cid();
    expect(cid).to.be.above(0);
    var c = x.channel({json:{c:cid}});
    expect(c).to.be.an('object');
    expect(c.reliable).to.be.false;
    expect(c.send).to.be.a('function');
    expect(c.state).to.be.equal('opening')
    expect(x.channels[c.id]).to.exist;
  });

  it('creates a reliable channel', function(){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    x.sync(handshakeBA);
    var c = x.channel({json:{c:x.cid(),seq:0}});
    expect(c.reliable).to.be.true;
    expect(x.channels[c.id]).to.exist;
  });

  it('handles unreliable open', function(done){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    x.sync(handshakeBA);
    var c = x.channel({json:{c:x.cid()}});
    c.receiving = function(err, packet, cb){
      expect(err).to.not.exist;
      expect(c.state).to.be.equal('open');
      expect(packet).to.be.an('object');
      expect(packet.json['42']).to.be.true;
      done();
    };
    c.receive({json:{'42':true}});
  });

  it('handles unreliable send', function(done){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    x.sync(handshakeBA);
    x.sending = function(buf){
      expect(Buffer.isBuffer(buf)).to.be.true;
      expect(buf.length).to.be.equal(35);
      var pkt = lob.decode(buf);
      expect(pkt.head.length).to.be.equal(0);
      done();
    };
    var open = {json:{c:x.cid()}};
    var c = x.channel(open);
    c.send(open);
  });

  it('handles reliable open', function(done){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    x.sync(handshakeBA);
    var open = {json:{c:x.cid(),seq:0}};
    var c = x.channel(open);
    c.receiving = function(err, packet, cb){
      expect(err).to.not.exist;
      expect(c.state).to.be.equal('open');
      expect(packet).to.be.an('object');
      expect(packet.json.seq).to.be.equal(0);
      done();
    };
    c.receive(open);
  });

  it('handles reliable send', function(done){
    var self = e3x.self({pairs:pairsA});
    var x = self.exchange({csid:'1a',key:pairsB['1a'].key});
    x.sync(handshakeBA);
    x.sending = function(buf){
      expect(Buffer.isBuffer(buf)).to.be.true;
      expect(buf.length).to.be.equal(43);
      done();
    };
    var open = {json:{c:x.cid(),seq:0}};
    var c = x.channel(open);
    c.send(open);
  });

});
