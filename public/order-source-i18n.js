const rows={
 orderUncertain:['有不确定信息 · 待核对','Uncertain details · review needed','Maklumat tidak pasti · perlu disemak'],
 orderWarningsReviewed:['提示已核对，可继续修改','Warnings reviewed; edit if needed','Amaran disemak; boleh disunting'],
 sourceEvidence:['对应原文','Source evidence','Bukti teks asal'],
 sourceLines:['原文行号','Source lines','Baris teks asal'],
 sourceNotLocated:['无法唯一定位此订单的原文，请展开完整原文核对。','The exact source for this order could not be uniquely located. Check the full source.','Teks asal pesanan ini tidak dapat dikenal pasti secara unik. Semak teks penuh.'],
 locateSource:['定位原文','Locate in source','Cari dalam teks asal'],
 fullSourceText:['完整原文（定位后会选中对应内容）','Full source (located text will be selected)','Teks penuh (teks berkaitan akan dipilih)']
};
export const orderSourceMessages=Object.fromEntries(['zh','en','ms'].map((lang,i)=>[lang,Object.fromEntries(Object.entries(rows).map(([key,values])=>[key,values[i]]))]));
