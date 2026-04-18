// ThingCounter/js/swatches.js
// Color palette data and lookup helper — pure, no DOM, no localStorage.

// ═══════════════════════════════════════════════
// Swatches — color palette
// ═══════════════════════════════════════════════

export const SWATCHES = [
    {color: '#FF4D57', name: 'Cherry'},
    {color: '#FF6F61', name: 'Coral'},
    {color: '#FF8C42', name: 'Tangerine'},
    {color: '#FFA62B', name: 'Mango'},
    {color: '#FFC857', name: 'Honey'},
    {color: '#E6FF4F', name: 'Lemon'},
    {color: '#7ED957', name: 'Limeade'},
    {color: '#4FD08B', name: 'Cactus'},
    {color: '#42E6A4', name: 'Mint'},
    {color: '#00A8A8', name: 'Lagoon'},
    {color: '#27D3C2', name: 'Turquoise'},
    {color: '#2ED9FF', name: 'Aqua'},
    {color: '#4FC3F7', name: 'Glacier'},
    {color: '#2F6BFF', name: 'Cobalt'},
    {color: '#3B82C4', name: 'Denim'},
    {color: '#6C8CFF', name: 'Periwinkle'},
    {color: '#5A5CFF', name: 'Indigo'},
    {color: '#7A4DFF', name: 'Plum'},
    {color: '#D65CFF', name: 'Orchid'},
    {color: '#FF4F81', name: 'Rose'},
];

export const DEFAULT_COLOR = '#2ED9FF';

export function swatchByColor(color) {
    return SWATCHES.find(s => s.color === color) || SWATCHES[0];
}