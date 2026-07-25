import pandas as pd
import sqlite3
import uuid

def generate_id():
    return str(uuid.uuid4())

def main():
    print("Reading Excel file...")
    df = pd.read_excel('datos_pad/aerovalesDesde01-01-2026al23-07-2026.xlsx')
    
    conn = sqlite3.connect('turnera.db')
    cur = conn.cursor()
    
    # Extract unique Clientes
    clientes = df['Razon Social Cliente'].dropna().unique()
    cliente_map = {} # map nombre -> id
    
    print(f"Extracting {len(clientes)} unique clientes...")
    for c in clientes:
        nombre = c.strip()
        # Check if exists
        cur.execute("SELECT id FROM clientes WHERE nombre = ?", (nombre,))
        row = cur.fetchone()
        if row:
            cliente_map[nombre] = row[0]
        else:
            cid = generate_id()
            cur.execute("INSERT INTO clientes (id, nombre, autogestionado, activo, creado) VALUES (?, ?, 0, 1, date('now'))", (cid, nombre))
            cliente_map[nombre] = cid
            
    # Extract unique Operadores
    operadores = df['Operador'].dropna().unique()
    print(f"Extracting {len(operadores)} unique operadores...")
    for o in operadores:
        nombre = o.strip()
        cur.execute("SELECT id FROM operadores WHERE nombre = ?", (nombre,))
        if not cur.fetchone():
            cid = generate_id()
            cur.execute("INSERT INTO operadores (id, nombre, activo) VALUES (?, ?, 1)", (cid, nombre))
            
    # Extract unique Aeronaves (mapping them to Cliente and Grado)
    # We will get the first occurrence of each aircraft to guess its client and fuel grade
    aeronaves_df = df.drop_duplicates(subset=['Vehiculo']).dropna(subset=['Vehiculo'])
    print(f"Extracting {len(aeronaves_df)} unique aeronaves...")
    
    for _, row in aeronaves_df.iterrows():
        matricula = str(row['Vehiculo']).strip().upper()
        if len(matricula) < 2: continue
        
        # Add a dash if it's 5 letters like LVHQR -> LV-HQR
        if len(matricula) == 5 and matricula.isalpha():
            matricula = f"{matricula[:2]}-{matricula[2:]}"
            
        cur.execute("SELECT matricula FROM aeronaves WHERE matricula = ?", (matricula,))
        if cur.fetchone():
            continue # already exists
            
        # Determine fuel grade
        producto = str(row['Producto']).upper()
        if '100' in producto:
            grado = 'AVGAS 100LL'
            motor = 'PISTON'
        else:
            grado = 'JET A-1'
            motor = 'TURBINA'
            
        cliente_nombre = str(row['Razon Social Cliente']).strip()
        cliente_id = cliente_map.get(cliente_nombre, '')
        
        if not cliente_id:
            # Fallback if cliente was missing or something
            cur.execute("SELECT id FROM clientes LIMIT 1")
            fallback = cur.fetchone()
            cliente_id = fallback[0] if fallback else ''
            
        cur.execute("""
            INSERT INTO aeronaves (matricula, tipo, motor, grado, excepcion_grado, cliente_id, hangar, capacidad, activa, creado)
            VALUES (?, 'S/D', ?, ?, 0, ?, 'S/D', 0, 1, date('now'))
        """, (matricula, motor, grado, cliente_id))
        
    conn.commit()
    conn.close()
    print("Database seeded successfully!")

if __name__ == '__main__':
    main()
