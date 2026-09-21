


from music21 import converter
import os
import subprocess
from PIL import Image

import fitz

import random

def random_rhythm(total_units):
    """Generate note lengths that sum exactly to total_units."""
    lengths = []
    remaining = total_units
    while remaining > 0:
        choices = [u for u in [1, 2, 4] if u <= remaining]
        length = random.choice(choices)
        lengths.append(length)
        remaining -= length
    return lengths

def generate_random_abc(duration_seconds=10, bpm=120, key='C'):
    """
    Generate a random ABC music file of approximately `duration_seconds` length.

    duration_seconds : target length in seconds
    bpm              : tempo in beats per minute (quarter note = 1 beat)
    key              : musical key (C, G, D, F, Am, etc.)
    """

    # Time signature: 4/4, L:1/8 → 8 units per measure
    beats_per_measure = 4
    units_per_measure = 8          # eighth notes per 4/4 measure
    measure_duration  = beats_per_measure * (60 / bpm)   # seconds
    num_measures      = max(1, round(duration_seconds / measure_duration))

    # Notes available (C major; adjust for other keys via K: field)
    note_pool = ['C', 'D', 'E', 'F', 'G', 'A', 'B',   # lower octave
                 'c', 'd', 'e', 'f', 'g', 'a', 'b']    # upper octave

    def length_str(note, length):
        """Format a note with its length multiplier."""
        return note if length == 1 else f"{note}{length}"

    # Build measures with stepwise-biased random melody
    measures = []
    prev_idx = random.randint(0, len(note_pool) - 1)

    for _ in range(num_measures):
        rhythm = random_rhythm(units_per_measure)
        bar = []
        for length in rhythm:
            # Bias toward stepwise motion (±1 or ±2 semitones in pool index)
            step = random.choices(
                [-2, -1, 0, 1, 2, 3],
                weights=[1, 3, 2, 3, 1, 1]
            )[0]
            prev_idx = max(0, min(len(note_pool) - 1, prev_idx + step))
            note = note_pool[prev_idx]
            bar.append(length_str(note, length))
        measures.append(' '.join(bar))

    # Format: 4 measures per line
    lines = []
    for i in range(0, len(measures), 4):
        group = measures[i:i+4]
        lines.append(' | '.join(group) + ' |')

    actual_duration = num_measures * measure_duration
    abc = (
        f"X: 1\n"
        f"T: \n"
        f"C: Auto-generated\n"
        f"M: 4/4\n"
        f"L: 1/8\n"
        f"Q: 1/4={bpm}\n"
        f"K: {key}\n"
        + '\n'.join(lines)
    )

    return abc, actual_duration

def crop_whitespace(img, padding=30):
    """Trim white margins, keeping a small padding around content."""
    gray = img.convert('L')
    inverted = gray.point(lambda p: 255 - p)  # white→black so getbbox finds content
    bbox = inverted.getbbox()
    if bbox:
        l, t, r, b = bbox
        l = max(0, l - padding)
        t = max(0, t - padding)
        r = min(img.width,  r + padding)
        b = min(img.height, b + padding)
        return img.crop((l, t, r, b))
    return img

def abc_to_score(abc_file, output_format='musicxml'):
    # print(f"Parsing {abc_file}...")
    score = converter.parse(abc_file)

    base = os.path.splitext(abc_file)[0]

    if output_format == 'lily.png':
        pdf_path = base + '.pdf'
        # print("Generating PDF via LilyPond...")
        score.write('lily.pdf', fp=base)

        # print("Converting PDF to PNG...")
        doc = fitz.open(pdf_path)
        pages = []
        for page in doc:
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img = crop_whitespace(img, padding=30)  # trim margins
            pages.append(img)
        doc.close()

        max_width    = max(img.width  for img in pages)
        total_height = sum(img.height for img in pages) + (10 * (len(pages) - 1))  # small gap between pages
        combined = Image.new('RGB', (max_width, total_height), 'white')
        y = 0
        for img in pages:
            combined.paste(img, ((max_width - img.width) // 2, y))  # center each page
            y += img.height + 10

        output_file = base + '.png'
        combined.save(output_file, dpi=(300, 300))
        # print(f"Done! File saved: {output_file}")
        return output_file

    ext_map = {'musicxml': '.xml', 'midi': '.mid', 'lily.pdf': '.pdf'}
    ext = ext_map.get(output_format, '.xml')
    output_file = base + ext
    fp_arg = base if output_format.startswith('lily') else output_file
    score.write(output_format, fp=fp_arg)
    # print(f"Done! File saved: {output_file}")
    return output_file


for i in range(0, 100):

    
    dura = 1 + int( i/5 )
    
    name = 'new_' + str(i)
    
    abc_content, duration = generate_random_abc(duration_seconds=dura, bpm=60, key='C')
    filename = 'random_melody_' + str(i) + '.abc'
    with open(filename, 'w') as f:
        f.write(abc_content)
    
    s = converter.parse('random_melody_' + str(i) + '.abc')
    s.write('midi', fp='random.mid')
    
    subprocess.run([
        'fluidsynth',
        '-ni',           # no interactive mode
        '-F', name + '.wav', # output file
        r'C:/Users/jcmon/OneDrive/Documentos/music_lilypond/piano.sf2',
        'random.mid'
    ], check=True)    
    
    

    abc_to_score('random_melody_' + str(i) + '.abc', output_format='lily.png')

#CORTAR IMAGEN
    
    base_name = 'random_melody_' + str(i)

    img_name = 'random_melody_' + str(i) + ".png"
    img = Image.open( img_name )
    width, height = img.size
        #left upper right lower
    crop_box = (0, 20, width , int(height * 0.08  ) )

    img.crop(crop_box).save(img_name)
    
    os.remove(  base_name + ".pdf" )
    os.remove(  base_name + ".abc" )
    os.remove(  base_name)
    os.remove(  "random.mid" )
    

temp = ""

each = open("each.txt", 'r', encoding="utf-8")
temp = each.read()
each.close()
print( temp)


final = ""
for i in range(0, 100):
    final += temp.replace("@imagen","random_melody_" + str(i) + ".png" ).replace("@audio", "new_" + str(i) + ".wav" )

esqueleto = open("html.html", 'r', encoding="utf-8")
temp = esqueleto.read()
esqueleto.close()

file = open("musica_lecciones.html", 'w',encoding="utf-8" )
file.write(  temp.replace("@html", final))
file.close()


  

    













