const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 仕様書 v1.8 14.2: ダークモード非対応・OS設定に関わらずライト固定。
  // 'class'戦略にして、dark:クラスを使わない=常にライトのスタイルのみが適用される状態にする
  darkMode: 'class',
  theme: {
    extend: {
      // 仕様書 v1.8 14.2 カラートークン。hexベタ書きの代わりにこの名前で参照する
      colors: {
        bg: '#F6F3ED',
        surface: '#FFFFFF',
        ink: '#3E3A34',
        'ink-soft': '#8C8579',
        line: '#E7E1D6',
        accent: '#7E8F86',
        'accent-ink': '#4E5B54',
        'status-submitted': '#8FA3B5',
        'status-approved': '#7E8F86',
        'status-rejected': '#B79A4B',
        'status-overdue': '#B9705F',
        'status-pending': '#B7AE9E',
      },
      borderRadius: {
        card: '16px',
        control: '12px',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      fontSize: {
        'title-lg': '22px',
        title: '17px',
        body: '15px',
        caption: '13px',
        tiny: '11px',
      },
    },
  },
  plugins: [],
};
