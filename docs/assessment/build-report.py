from pathlib import Path
import re, json
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from PIL import Image
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'FormBridge-AT2-Report.md'
DOC=ROOT/'FormBridge-AT2-Report.docx'
GREEN='203D35'; GREY='526258'; PALE='F1F4EC'
doc=Document()
sec=doc.sections[0]
sec.page_width=Inches(8.2677); sec.page_height=Inches(11.6929)
sec.top_margin=Inches(.72); sec.bottom_margin=Inches(.68)
sec.left_margin=Inches(.76); sec.right_margin=Inches(.76)
sec.header_distance=Inches(.28);sec.footer_distance=Inches(.28)
styles=doc.styles
n=styles['Normal']; n.font.name='Arial';n.font.size=Pt(10.5);n.font.color.rgb=RGBColor.from_string('23352D')
n.paragraph_format.line_spacing=1.05;n.paragraph_format.space_after=Pt(4.5)
for name,size in [('Heading 1',18.5),('Heading 2',12)]:
 st=styles[name];st.font.name='Georgia' if name=='Heading 1' else 'Arial';st.font.size=Pt(size);st.font.bold=name=='Heading 2';st.font.color.rgb=RGBColor.from_string(GREEN)
 st.paragraph_format.space_before=Pt(8 if name=='Heading 2' else 0);st.paragraph_format.space_after=Pt(7)
 st.paragraph_format.keep_with_next=True
styles['Caption'].font.name='Arial';styles['Caption'].font.size=Pt(8.4);styles['Caption'].font.color.rgb=RGBColor.from_string(GREY)
styles['Caption'].paragraph_format.space_after=Pt(6);styles['Caption'].paragraph_format.line_spacing=1.04
h=sec.header.paragraphs[0];h.text='FORMBRIDGE   /   APPLIED NATURAL LANGUAGE PROCESSING'
h.style='Caption';h.paragraph_format.space_after=Pt(0)
for r in h.runs:r.font.size=Pt(8);r.font.bold=True;r.font.color.rgb=RGBColor.from_string(GREY)
pb=OxmlElement('w:pBdr');b=OxmlElement('w:bottom');b.set(qn('w:val'),'single');b.set(qn('w:sz'),'4');b.set(qn('w:color'),'C9D4C4');pb.append(b);h._p.get_or_add_pPr().append(pb)
ft=sec.footer.paragraphs[0];ft.alignment=WD_ALIGN_PARAGRAPH.RIGHT
ft.add_run('FormBridge  ·  ')
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');ft._p.append(field)
ft.add_run(' / ')
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'NUMPAGES');ft._p.append(field)
for r in ft.runs:r.font.name='Arial';r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string(GREY)
# Mark a first-page cover without the running header.
sec.different_first_page_header_footer=True
doc.core_properties.title='FormBridge: Evidence-linked dialogue state tracking for restaurant booking briefs'
doc.core_properties.subject='36118 Applied Natural Language Processing, AT2 Part B'
doc.core_properties.author='FormBridge project group'
doc.core_properties.keywords='dialogue state tracking, restaurant booking, NLP, evidence, human review'
doc.core_properties.comments=''

def add_link(p,text,url):
 rel=p.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
 h=OxmlElement('w:hyperlink');h.set(qn('r:id'),rel);r=OxmlElement('w:r');rp=OxmlElement('w:rPr')
 color=OxmlElement('w:color');color.set(qn('w:val'),GREEN);rp.append(color);r.append(rp);t=OxmlElement('w:t');t.text=text;r.append(t);h.append(r);p._p.append(h)
def rich(p,s,small=False):
 # Keep citations as authored; format emphasis and working external links.
 for part in re.split(r'(\*\*.*?\*\*|\*[^*]+\*|https?://[^\s]+)',s):
  if not part:continue
  if part.startswith('http'):
   add_link(p,part,part);continue
  r=p.add_run(part[2:-2] if part.startswith('**') and part.endswith('**') else part[1:-1] if part.startswith('*') and part.endswith('*') else part)
  if part.startswith('**'):r.bold=True
  elif part.startswith('*'):r.italic=True
  if small:r.font.size=Pt(9)

def table(lines,page):
 rows=[[x.strip() for x in line.strip().strip('|').split('|')] for line in lines]
 rows=[row for row in rows if not all(re.fullmatch(r':?-+:?',x) for x in row)]
 t=doc.add_table(rows=0,cols=len(rows[0]));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 cols=len(rows[0]);total=6.7477
 widths=[total/cols]*cols
 if cols==2:widths=[total*.31,total*.69]
 if page==2:widths=[total*.87,total*.13]
 if page==10 and cols==5:widths=[2.15,1.05,1.1,1.2,1.2477]
 if page==11 and cols==4:widths=[2.3,1.15,1.65,1.6477]
 if page==14 and cols==3:widths=[1.85,1.25,3.6477]
 for i,w in enumerate(widths):t.columns[i].width=Inches(w)
 for ri,row in enumerate(rows):
  cells=t.add_row().cells
  for ci,txt in enumerate(row):
   cells[ci].width=Inches(widths[ci]);cells[ci].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   p=cells[ci].paragraphs[0];p.paragraph_format.space_after=Pt(1.5);p.paragraph_format.space_before=Pt(1.5);p.paragraph_format.line_spacing=1.02
   rich(p,txt,True)
   for r in p.runs:
    r.font.name='Arial';r.font.size=Pt(8.9 if page==10 else 9.1)
    if ri==0:r.font.bold=True;r.font.color.rgb=RGBColor(255,255,255)
   tcpr=cells[ci]._tc.get_or_add_tcPr();shade=OxmlElement('w:shd');shade.set(qn('w:fill'),GREEN if ri==0 else PALE if ri%2 else 'FFFFFF');tcpr.append(shade)
   margins=OxmlElement('w:tcMar')
   for side in ['top','bottom','left','right']:
    m=OxmlElement('w:'+side);m.set(qn('w:w'),'45');m.set(qn('w:type'),'dxa');margins.append(m)
   tcpr.append(margins)
  trpr=cells[0]._tc.getparent().get_or_add_trPr()
  nosplit=OxmlElement('w:cantSplit');trpr.append(nosplit)
  if ri==0:
   repeat=OxmlElement('w:tblHeader');trpr.append(repeat)
 doc.add_paragraph().paragraph_format.space_after=Pt(1)

def picture(path,page):
 path=ROOT/path
 p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
 p.paragraph_format.space_before=Pt(4);p.paragraph_format.space_after=Pt(3);p.paragraph_format.keep_with_next=True
 widths={1:6.7,4:6.2,5:6.7,7:6.7,10:6.7,12:1.23}
 p.add_run().add_picture(str(path),width=Inches(widths.get(page,6.3)))

def paragraph(text,page):
 caption=text.startswith('*Figure ') or text.startswith('*Table ')
 p=doc.add_paragraph(style='Caption' if caption else None)
 rich(p,text[1:-1] if caption and text.endswith('*') else text)
 if page==15 and not caption:
  p.paragraph_format.left_indent=Inches(.5);p.paragraph_format.first_line_indent=Inches(-.5)
  p.paragraph_format.space_after=Pt(0);p.paragraph_format.line_spacing=2.0
  for r in p.runs:r.font.size=Pt(10.5)
 return p

def cover(body):
 lines=body.splitlines();metadata={}
 for line in lines:
  match=re.match(r'\*\*([^*]+):\*\*\s*(.+)',line)
  if match:metadata[match[1]]=match[2]
 title=next(line[2:] for line in lines if line.startswith('# '))
 subtitle=next(line[3:] for line in lines if line.startswith('## '))
 # Academic cover follows the supplied UTS layout.
 p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
 p.paragraph_format.space_before=Pt(26);p.paragraph_format.space_after=Pt(75)
 p.paragraph_format.line_spacing=1.0
 p.add_run().add_picture(str(ROOT/'assets/uts-logo.jpg'),width=Inches(5.4166666667))
 def cover_text(text,size,before=0,after=0,center=True):
  p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
  p.paragraph_format.space_before=Pt(before);p.paragraph_format.space_after=Pt(after)
  p.paragraph_format.line_spacing=1.0;p.paragraph_format.keep_with_next=True
  r=p.add_run(text);r.font.name='Liberation Serif';r.font.size=Pt(size);r.bold=True
  r.font.color.rgb=RGBColor.from_string('202932')
  return p
 cover_text(title,19,after=8)
 cover_text(subtitle,14,after=19)
 cover_text(metadata['Subject'],14,after=140)
 cover_text('Student Name: '+metadata['Student Name'],11.5,after=4,center=False)
 p=cover_text('Student ID: '+metadata['Student ID'],11.5,after=18,center=False)
 p.paragraph_format.keep_with_next=False

chunks=re.split(r'<!-- PAGE (\d+) -->',SRC.read_text())
for idx in range(1,len(chunks),2):
 page=int(chunks[idx]);body=chunks[idx+1].strip();lines=body.splitlines()

 if page==1:
  cover(body)
  continue
 if page==12:
  title=doc.add_paragraph(lines[0][2:],style='Heading 1');title.paragraph_format.page_break_before=True
  layout=doc.add_table(rows=1,cols=2);layout.autofit=False;layout.alignment=WD_TABLE_ALIGNMENT.CENTER
  layout.columns[0].width=Inches(4.43);layout.columns[1].width=Inches(2.31)
  left,right=layout.rows[0].cells;left.width=Inches(4.43);right.width=Inches(2.31)
  for cell in [left,right]:
   cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
   cp=cell._tc.get_or_add_tcPr();mar=OxmlElement('w:tcMar')
   for side in ['top','bottom','left','right']:
    m=OxmlElement('w:'+side);m.set(qn('w:w'),'0' if side!='right' else '110');m.set(qn('w:type'),'dxa');mar.append(m)
   cp.append(mar)
  fig=right.paragraphs[0];fig.alignment=WD_ALIGN_PARAGRAPH.CENTER
  fig.add_run().add_picture(str(ROOT/'assets/mobile-brief.jpg'),width=Inches(2.02))
  caption=right.add_paragraph(style='Caption')
  blocks=re.split(r'\n\s*\n','\n'.join(lines[1:]))
  for block in blocks:
   block=' '.join(block.strip().splitlines())
   if not block:continue
   if block.startswith('!['):
    tail=block.split(')',1)[1].strip()
    if tail.startswith('*Figure '):rich(caption,tail[1:-1])
    continue
   if block.startswith('*Figure '):rich(caption,block[1:-1]);continue
   if block.startswith('## '):
    p=left.add_paragraph(block[3:],style='Heading 2')
   else:
    p=left.add_paragraph();rich(p,block)
  continue
 i=0;buf=[]
 def flush():
  if buf:paragraph(' '.join(buf),page);buf.clear()
 while i<len(lines):
  line=lines[i].strip()
  if not line:flush();i+=1;continue
  if line.startswith('~~~'):
   flush();i+=1;code=[]
   while i<len(lines) and not lines[i].strip().startswith('~~~'):
    code.append(lines[i]);i+=1
   p=doc.add_paragraph();p.paragraph_format.space_after=Pt(7);p.paragraph_format.line_spacing=1.0
   r=p.add_run('\n'.join(code));r.font.name='Courier New';r.font.size=Pt(7.8);r.font.color.rgb=RGBColor.from_string(GREEN)
   sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'F1F4EC');p._p.get_or_add_pPr().append(sh)
   i+=1;continue
  if line.startswith('|'):
   flush();block=[]
   while i<len(lines) and lines[i].strip().startswith('|'):block.append(lines[i]);i+=1
   table(block,page);continue
  if line.startswith('# '):
   flush();p=doc.add_paragraph(line[2:],style='Heading 1')
   if page>1:p.paragraph_format.page_break_before=True
   if page==1:
    p.paragraph_format.space_before=Pt(15);p.paragraph_format.space_after=Pt(14)
    for r in p.runs:r.font.size=Pt(47)
   i+=1;continue
  if line.startswith('## '):
   flush();p=doc.add_paragraph(line[3:],style='Heading 2')
   if page==1:
    p.paragraph_format.space_after=Pt(18)
    for r in p.runs:r.font.name='Georgia';r.font.size=Pt(19);r.font.bold=False
   i+=1;continue
  m=re.fullmatch(r'!\[.*\]\((.*)\)',line)
  if m:flush();picture(m[1],page);i+=1;continue
  if re.match(r'^\d+\. ',line):
   flush();p=doc.add_paragraph();p.paragraph_format.left_indent=Inches(.15);p.paragraph_format.first_line_indent=Inches(-.15);rich(p,line);i+=1;continue
  if line.endswith('  '):flush();paragraph(line,page);i+=1;continue
  # Treat metadata lines and captions independently.
  if page==1 or line.startswith('*Figure ') or line.startswith('*Table '):
   flush();paragraph(line,page);i+=1;continue
  buf.append(line);i+=1
 flush()
settings=doc.settings.element
update=OxmlElement('w:updateFields');update.set(qn('w:val'),'true');settings.append(update)
doc.save(DOC)
print(DOC)
