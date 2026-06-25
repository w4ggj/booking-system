const { shopifyGraphQL } = require('./shopify');

const TYPE = 'membership_member';

function parseNode(node) {
  const f = node.fields.reduce((acc, { key, value }) => { acc[key] = value; return acc; }, {});
  return {
    id:             node.id,
    customerId:     f.customer_id,
    email:          f.customer_email,
    name:           f.customer_name,
    subscriptionId: f.subscription_contract_id,
    status:         f.status || 'active',
    tier:           f.tier || 'elite',
    startedAt:      f.started_at,
    nextBillingDate: f.next_billing_date,
  };
}

async function getAllMembers() {
  const data = await shopifyGraphQL(`
    query {
      metaobjects(type: "${TYPE}", first: 250, sortKey: UPDATED_AT) {
        nodes { id fields { key value } }
      }
    }
  `);
  return data.metaobjects.nodes.map(parseNode);
}

async function getMemberByEmail(email) {
  const all = await getAllMembers();
  return all.find(m => m.email && m.email.toLowerCase() === email.toLowerCase()) || null;
}

async function getMemberBySubscriptionId(subscriptionId) {
  const all = await getAllMembers();
  return all.find(m => m.subscriptionId === subscriptionId) || null;
}

async function getMemberById(metaobjectId) {
  const data = await shopifyGraphQL(`
    query($id: ID!) { metaobject(id: $id) { id fields { key value } } }
  `, { id: metaobjectId });
  if (!data.metaobject) return null;
  return parseNode(data.metaobject);
}

async function createMember({ customerId, email, name, subscriptionId }) {
  const now = new Date().toISOString();
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const data = await shopifyGraphQL(`
    mutation($m: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $m) {
        metaobject { id fields { key value } }
        userErrors { field message }
      }
    }
  `, {
    m: {
      type: TYPE,
      fields: [
        { key: 'customer_id',              value: customerId    },
        { key: 'customer_email',           value: email         },
        { key: 'customer_name',            value: name || ''    },
        { key: 'subscription_contract_id', value: subscriptionId },
        { key: 'status',                   value: 'active'      },
        { key: 'tier',                     value: 'elite'       },
        { key: 'started_at',               value: now           },
        { key: 'next_billing_date',        value: nextMonth.toISOString() },
      ],
    },
  });
  const { userErrors, metaobject } = data.metaobjectCreate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  return parseNode(metaobject);
}

async function updateMember(metaobjectId, updates) {
  const KEYS = ['customer_id','customer_email','customer_name','subscription_contract_id','status','tier','started_at','next_billing_date'];
  const current = await getMemberById(metaobjectId);
  if (!current) throw new Error('Member not found');

  const merged = {
    customer_id:              current.customerId,
    customer_email:           current.email,
    customer_name:            current.name,
    subscription_contract_id: current.subscriptionId,
    status:                   current.status,
    tier:                     current.tier,
    started_at:               current.startedAt,
    next_billing_date:        current.nextBillingDate,
    ...updates,
  };

  const fields = KEYS.map(k => ({ key: k, value: merged[k] || '' }));
  const data = await shopifyGraphQL(`
    mutation($id: ID!, $m: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $m) {
        metaobject { id fields { key value } }
        userErrors { field message }
      }
    }
  `, { id: metaobjectId, m: { fields } });
  const { userErrors, metaobject } = data.metaobjectUpdate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  return parseNode(metaobject);
}

async function deleteMember(metaobjectId) {
  const data = await shopifyGraphQL(`
    mutation($id: ID!) {
      metaobjectDelete(id: $id) { deletedId userErrors { field message } }
    }
  `, { id: metaobjectId });
  const { userErrors } = data.metaobjectDelete;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
}

async function tagCustomer(customerId, tag) {
  await shopifyGraphQL(`
    mutation($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
    }
  `, { id: customerId, tags: [tag] });
}

async function untagCustomer(customerId, tag) {
  await shopifyGraphQL(`
    mutation($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
    }
  `, { id: customerId, tags: [tag] });
}

async function getCustomer(customerId) {
  const data = await shopifyGraphQL(`
    query($id: ID!) { customer(id: $id) { id email firstName lastName tags } }
  `, { id: customerId });
  return data.customer;
}

module.exports = {
  getAllMembers, getMemberByEmail, getMemberBySubscriptionId, getMemberById,
  createMember, updateMember, deleteMember,
  tagCustomer, untagCustomer, getCustomer,
};
