'use strict';

var AABB = require('./AABB');

/**
 * @const {String[]} AXES x, y, and z axes
 */
var AXES = ['x', 'y', 'z'];

/**
 * Persistant object maintaining sorted lists of AABB endpoints used in a sweep-and-prune broadphase.
 * Used to accelerate collision detection.
 * http://en.wikipedia.org/wiki/Sweep_and_prune
 *
 * @class SweepAndPrune
 * @param {Body[]} targets
 * @param {Object} options
 */
function SweepAndPrune(targets, options) {
    this._sweepVolumes = [];
    this._entityRegistry = {};
    this._boundingVolumeRegistry = {};
    this.endpoints = {x: [], y: [], z: []};

    this.overlaps = [];
    this.overlapsMatrix = {};
    this._IDPool = [];
    targets = targets || [];
    for (var i = 0; i < targets.length; i++) {
        this.add(targets[i]);
    }
};

/**
 * Start tracking a body in the broad-phase.
 *
 * @method add
 * @param {Body} body
 */
SweepAndPrune.prototype.add = function(body) {
    var boundingVolume = new AABB(body);
    var sweepVolume = new SweepVolume(boundingVolume);

    this._entityRegistry[body._ID] = body;
    this._boundingVolumeRegistry[body._ID] = boundingVolume;
    this._sweepVolumes.push(sweepVolume);

    for (var i = 0; i < 3; i++) {
        var axis = AXES[i];
        this.endpoints[axis].push(sweepVolume.points[axis][0]);
        this.endpoints[axis].push(sweepVolume.points[axis][1]);
    }
};

/**
 * Stop tracking a body in the broad-phase.
 *
 * @method add
 * @param {Body} body
 */
SweepAndPrune.prototype.remove = function remove(body) {
    this._entityRegistry[body._ID] = null;
    this._boundingVolumeRegistry[body._ID] = null;
    var index;
    for (var i = 0, len = this._sweepVolumes.length; i < len; i++) {
        if (this._sweepVolumes[i]._ID === body._ID) {
            index = i;
            break;
        }
    }
    this._sweepVolumes.splice(index, 1);
    var endpoints = this.endpoints;

    var xs = [];
    for (var i = 0, len = endpoints.x.length; i < len; i++) {
        var point = endpoints.x[i];
        if (point._ID !== body._ID) xs.push(point)
    }
    var ys = [];
    for (var i = 0, len = endpoints.y.length; i < len; i++) {
        var point = endpoints.y[i];
        if (point._ID !== body._ID) ys.push(point)
    }
    var zs = [];
    for (var i = 0, len = endpoints.z.length; i < len; i++) {
        var point = endpoints.z[i];
        if (point._ID !== body._ID) zs.push(point)
    }
    endpoints.x = xs;
    endpoints.y = yz;
    endpoints.z = zs;
};

/**
 * Update the endpoints of the tracked AABB's and resort the endpoint lists accordingly. Uses an insertion sort,
 * where swaps during the sort are taken to signify a potential change in overlap status for the two
 * relevant AABB's. Returns pairs of overlapping AABB's.
 *
 * @param update
 * @return {Particle[][]}
 */
SweepAndPrune.prototype.update = function() {
    var _sweepVolumes = this._sweepVolumes;
    var _entityRegistry = this._entityRegistry;
    var _boundingVolumeRegistry = this._boundingVolumeRegistry;

    for (var j = 0, len = _sweepVolumes.length; j < len; j++) {
        _sweepVolumes[j].update();
    }

    var endpoints = this.endpoints;
    var overlaps = this.overlaps;
    var overlapsMatrix = this.overlapsMatrix;
    var _IDPool = this._IDPool;

    for (var k = 0; k < 3; k++) {
        var axis = AXES[k];
        // Insertion sort:
        var endpointAxis = endpoints[axis];
        for (var j = 1, len = endpointAxis.length; j < len; j++) {
            var current = endpointAxis[j];
            var val = current.value;
            var i = j - 1;
            var swap;
            var row;
            var index;
            var lowID;
            var highID;
            var cID;
            var sID;
            while (i >= 0 && (swap = endpointAxis[i]).value > val) {
                // A swap occurence indicates that current and swap either just started or just stopped overlapping

                cID = current._ID;
                sID = swap._ID;

                if (cID < sID) {
                    lowID = cID;
                    highID = sID;
                } else {
                    lowID = sID;
                    highID = cID;
                }

                // If, for this axis, min point of current and max point of swap
                if (~current.side & swap.side) {
                    // Now overlapping on this axis -> possible overlap, do full AABB check
                    if (AABB.checkOverlap(_boundingVolumeRegistry[cID], _boundingVolumeRegistry[sID])) {
                        row = overlapsMatrix[lowID] = overlapsMatrix[lowID] || {};
                        index = row[highID] = _IDPool.length ? _IDPool.pop() : overlaps.length;
                        overlaps[index] = [_entityRegistry[lowID], _entityRegistry[highID]];
                    }
                // // Else if, for this axis, max point of current and min point of swap
                } else if (current.side & ~swap.side) {
                    // Now not overlapping on this axis -> definitely not overlapping
                    if ((row = overlapsMatrix[lowID]) && row[highID] != null) {
                        index = row[highID];
                        overlaps[index] = null;
                        row[highID] = null;
                        _IDPool.push(index);
                    }
                }
                // Else if max of both or min of both, still overlapping

                endpointAxis[i + 1] = swap;
                i--;
            }
            endpointAxis[i + 1] = current;
        }
    }

    return overlaps;
};

/**
 * Object used to associate an AABB with its endpoints in the sorted lists.
 *
 * @class SweepVolume
 * @constructor
 * @param {AABB} boundingVolume
 */
function SweepVolume(boundingVolume) {
    this._boundingVolume = boundingVolume;
    this._ID = boundingVolume._ID;
    this.points = {
        x: [{_ID: boundingVolume._ID, side: 0, value: null}, {_ID: boundingVolume._ID, side: 1, value: null}],
        y: [{_ID: boundingVolume._ID, side: 0, value: null}, {_ID: boundingVolume._ID, side: 1, value: null}],
        z: [{_ID: boundingVolume._ID, side: 0, value: null}, {_ID: boundingVolume._ID, side: 1, value: null}]
    }
    this.update();
};

/**
 * Update the endpoints to reflect the current location of the AABB.
 *
 * @method update
 */
SweepVolume.prototype.update = function() {
    var boundingVolume = this._boundingVolume;
    boundingVolume.update();

    var pos = boundingVolume.position;
    var points = this.points;

    for (var i = 0; i < 3; i++) {
        var axis = AXES[i];
        points[axis][0].value = boundingVolume.vertices[axis][0];
        points[axis][1].value = boundingVolume.vertices[axis][1];
    }
};

module.exports = SweepAndPrune;
