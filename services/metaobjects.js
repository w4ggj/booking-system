const { shopifyGraphQL } = require('./shopify');

const toMap = (fields) => fields.reduce((acc, f) => { acc[f.key] = f.value; return acc; }, {});

// ─── Reservations ─────────────────────────────────────────────────────────────

async function createReservation({ date, startTime, endTime, durationHours, isFullDay, customerName, customerEmail, orderId, orderNumber, totalPrice }) {
  const data = await shopifyGraphQL(`
    mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message }
      }
    }
  `, {
    metaobject: {
      type: 'reservation',
      fields: [
        { key: 'date',            value: date },
        { key: 'start_time',      value: startTime },
        { key: 'end_time',        value: endTime },
        { key: 'duration_hours',  value: String(durationHours) },
        { key: 'is_full_day',     value: isFullDay ? 'true' : 'false' },
        { key: 'customer_name',   value: customerName },
        { key: 'customer_email',  value: customerEmail },
        { key: 'order_id',        value: orderId || '' },
        { key: 'order_number',    value: orderNumber || '' },
        { key: 'status',          value: 'confirmed' },
        { key: 'total_price',     value: String(totalPrice) },
        { key: 'notes',           value: '' },
      ],
    },
  });

  const { userErrors, metaobject } = data.metaobjectCreate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  return metaobject;
}

async function getReservationsForDate(date) {
  const data = await shopifyGraphQL(`
    query { metaobjects(type: "reservation", first: 250) { nodes { id fields { key value } } } }
  `);
  return data.metaobjects.nodes
    .map(n => ({ id: n.id, ...toMap(n.fields) }))
    .filter(r => r.date === date && r.status !== 'cancelled');
}

async function getAllReservations({ includeAll = false } = {}) {
  const data = await shopifyGraphQL(`
    query { metaobjects(type: "reservation", first: 250) { nodes { id fields { key value } } } }
  `);
  const all = data.metaobjects.nodes.map(n => ({ id: n.id, ...toMap(n.fields) }));

  if (includeAll) return all.sort((a, b) => b.date.localeCompare(a.date));

  const today = new Date().toISOString().split('T')[0];
  return all
    .filter(r => r.date >= today)
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.start_time.localeCompare(b.start_time));
}

async function cancelReservation(id) {
  const data = await shopifyGraphQL(`
    mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }
  `, { id, metaobject: { fields: [{ key: 'status', value: 'cancelled' }] } });

  const { userErrors } = data.metaobjectUpdate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
}

async function reservationExistsForOrder(orderId) {
  const data = await shopifyGraphQL(`
    query { metaobjects(type: "reservation", first: 250) { nodes { fields { key value } } } }
  `);
  return data.metaobjects.nodes.some(n => {
    const fields = toMap(n.fields);
    return fields.order_id === String(orderId);
  });
}

// ─── Blocked slots ─────────────────────────────────────────────────────────────

async function getBlockedSlotsForDate(date) {
  const data = await shopifyGraphQL(`
    query { metaobjects(type: "blocked_slot", first: 250) { nodes { id fields { key value } } } }
  `);
  return data.metaobjects.nodes
    .map(n => ({ id: n.id, ...toMap(n.fields) }))
    .filter(b => b.date === date);
}

async function getAllBlockedSlots() {
  const data = await shopifyGraphQL(`
    query { metaobjects(type: "blocked_slot", first: 250) { nodes { id fields { key value } } } }
  `);
  return data.metaobjects.nodes
    .map(n => ({ id: n.id, ...toMap(n.fields) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function createBlockedSlot({ date, startTime, endTime, reason }) {
  const data = await shopifyGraphQL(`
    mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }
  `, {
    metaobject: {
      type: 'blocked_slot',
      fields: [
        { key: 'date',       value: date },
        { key: 'start_time', value: startTime || '' },
        { key: 'end_time',   value: endTime || '' },
        { key: 'reason',     value: reason || 'Blocked by admin' },
      ],
    },
  });

  const { userErrors, metaobject } = data.metaobjectCreate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  return metaobject;
}

async function deleteMetaobject(id) {
  const data = await shopifyGraphQL(`
    mutation DeleteMetaobject($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors { field message }
      }
    }
  `, { id });

  const { userErrors } = data.metaobjectDelete;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
}

module.exports = {
  createReservation,
  getReservationsForDate,
  getAllReservations,
  cancelReservation,
  reservationExistsForOrder,
  getBlockedSlotsForDate,
  getAllBlockedSlots,
  createBlockedSlot,
  deleteMetaobject,
};
