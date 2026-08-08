import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss';
import transformerDirectives from '@unocss/transformer-directives';
import transformerVariantGroup from '@unocss/transformer-variant-group';

export default defineConfig({
  presets: [presetUno(), presetAttributify(), presetIcons()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    // Layout
    'page-container': 'p-6 h-full flex flex-col min-h-0',
    'page-title': 'text-xl font-bold text-[#111827] tracking-tight',

    // Cards
    'card': 'bg-white border border-gray-200 shadow-sm rounded',
    'card-hover': 'card hover:shadow transition-all',

    // Buttons
    'btn': 'px-4 py-1.5 text-xs font-medium rounded transition-all cursor-pointer select-none inline-flex items-center justify-center gap-1.5',
    'btn-primary': 'btn bg-[#2563EB] text-white hover:bg-[#1D4ED8]',
    'btn-secondary': 'btn border border-gray-300 text-gray-700 hover:bg-gray-50',
    'btn-ghost': 'btn text-gray-500 hover:text-gray-700 hover:bg-gray-50',

    // Inputs
    'input-base': 'w-full bg-gray-100 border border-gray-300 rounded px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400',
    'select-base': 'text-xs border-gray-300 border rounded p-1 bg-white',

    // Badges
    'badge': 'inline-block text-[10px] font-bold px-2 py-0.5 rounded-full',
    'badge-green': 'badge bg-green-100 text-green-700',
    'badge-orange': 'badge bg-orange-100 text-orange-700',
    'badge-blue': 'badge bg-blue-100 text-blue-700',
    'badge-gray': 'badge bg-gray-100 text-gray-600',

    // Table
    'table-header': 'bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-xs',
    'table-cell': 'p-3',
    'table-row-hover': 'hover:bg-blue-50 transition-colors',
  },
  theme: {
    colors: {
      // Reference project palette
      sidebar: '#1F2937',
      'sidebar-header': '#111827',
      'sidebar-active': '#1D4ED8',
      'page-bg': '#F3F4F6',
      'card-border': '#E5E7EB',
      'text-primary': '#111827',
      'text-secondary': '#6B7280',
      'text-muted': '#9CA3AF',
    },
  },
});
