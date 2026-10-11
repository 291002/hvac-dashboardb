/* Green layer over the site image: the traced road corridors are covered with lawn and tree planting,
   so the map shows only towers and green areas. Coordinates are image pixels (1106 × 744). Printed pins stay visible. */
(function(){
  // [path, corridor width px] — traced from the aerial image
  const ROADS=[
    ['M0,111 C200,110 400,107 553,105 C760,101 950,92 1106,87',27],
    ['M0,139 C300,141 450,142 553,143 C660,145 740,146 800,143 C900,134 1000,122 1106,113',27],
    ['M0,87 C110,89 210,95 300,104',16],
    ['M120,142 C100,180 80,212 58,244',12],
    ['M470,0 C468,40 456,80 402,105',11],
    ['M500,0 C505,45 520,84 562,101',11],
    ['M195,0 C188,40 181,62 172,84',10],
    ['M790,150 C900,190 1000,236 1106,282',30],
    ['M820,170 C920,200 1010,232 1106,262',16],
    ['M115,163 C300,165 460,167 553,168 C620,170 655,171 690,175 C780,188 880,224 952,262 C1010,298 1052,338 1084,382 C1094,402 1102,420 1106,432',17],
    ['M0,268 C150,265 350,261 553,262 C640,266 700,281 742,316 C782,352 792,398 776,442 C756,490 702,515 610,519',20],
    ['M0,505 C200,506 420,508 553,510 C640,513 700,516 760,514 C790,513 810,512 830,512',19],
    ['M828,222 C829,330 830,450 830,556',11],
    ['M830,556 C930,557 1020,558 1106,560',10],
    ['M165,712 C300,688 450,662 553,645 C700,622 900,590 1106,568',34],
    ['M853,744 C855,690 880,650 953,610 C1010,598 1060,614 1106,640',11]
  ];
  // printed pins, labels and the compass on the image stay visible
  const KEEP=[[36,228,160,58],[312,160,44,58],[460,160,44,58],[628,168,46,58],[666,298,50,58],[888,336,182,110],
              [430,406,46,58],[563,414,46,58],[96,512,48,58],[316,519,48,58],[464,521,48,58],[681,534,46,58],[1030,660,66,62]];

  // corridors are filled with tree canopy from the image itself, with a soft edge
  const svg=`<svg class="roads" viewBox="0 0 1106 744" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <!-- real tree canopy sampled from the park at the bottom of the site image -->
      <pattern id="lawn" width="240" height="60" patternUnits="userSpaceOnUse"><image href="hvac-site.png" x="-380" y="-678" width="1106" height="744" preserveAspectRatio="none"/></pattern>
      <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.3"/></filter>
      <mask id="rdKeep" maskUnits="userSpaceOnUse" x="0" y="0" width="1106" height="744">
        <rect width="1106" height="744" fill="#fff"/>${KEEP.map(([x,y,w,h])=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#000"/>`).join('')}
      </mask>
    </defs>
    <g mask="url(#rdKeep)">
      <g filter="url(#soft)">${ROADS.map(([p,w])=>`<path d="${p}" fill="none" stroke="url(#lawn)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</g>
    </g>
  </svg>`;

  const img=document.querySelector('#stage img');
  if(img) img.insertAdjacentHTML('afterend',svg);
})();
