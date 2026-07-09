import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { CycleDots } from '../components/CycleDots';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import {
  CycleDotStatus,
  deriveCycleStatus,
  formatCampaignNo,
  generateCyclesAndTasks,
  suggestCampaignTitle,
} from '../lib/campaigns';
import { supabase } from '../lib/supabase';

type ProductSelection = {
  key: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  title: string;
  brand: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
};

type MonitorOption = { id: string; name: string; nickname: string | null };
type ChildOption = { id: string; call_name: string };
type FormFieldMaster = {
  key: string;
  label: string;
  input_type: string;
  is_system: boolean;
  sort_order: number;
};

type SearchVariant = {
  shopifyVariantId: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
};
type SearchProduct = {
  shopifyProductId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  variants: SearchVariant[];
};

type EditCampaign = {
  id: string;
  campaignNo: number;
  monitorName: string | null;
  productSummary: string;
  recurrenceSummary: string;
  dropboxBasePath: string | null;
};

type CycleRow = {
  cycleNo: number;
  label: string;
  mediaDueDate: string | null;
  mediaStatus: string | null;
  snsDueDate: string | null;
  snsStatus: string | null;
  dotStatus: CycleDotStatus;
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '未提出',
  submitted: '提出済',
  approved: '確認済',
  rejected: '差し戻し',
  cancelled: 'キャンセル',
};

// 案件作成・編集(仕様書 v1.8 画面一覧4)。idパラメータが無ければ新規作成、あれば編集(基本情報の編集+回次/タスクの閲覧)。
// クーポン注文の「案件化する」からの遷移時は sourceOrderId/monitorId/shippedAt/shipmentOrderNo/lineItems で prefill する。
export default function AdminCampaignForm() {
  const params = useLocalSearchParams<{
    id?: string;
    sourceOrderId?: string;
    monitorId?: string;
    monitorName?: string;
    shipmentOrderNo?: string;
    shippedAt?: string;
    lineItems?: string;
  }>();
  const isEdit = !!params.id;

  // ---- 編集モード ----
  const [editCampaign, setEditCampaign] = useState<EditCampaign | null>(null);
  const [cycleRows, setCycleRows] = useState<CycleRow[]>([]);
  const [editLoading, setEditLoading] = useState(isEdit);
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ---- 共通(編集モードでも使う基本フィールド) ----
  const [title, setTitle] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [internalMemo, setInternalMemo] = useState('');
  const [shootingGuideline, setShootingGuideline] = useState('');

  // ---- 新規作成モード専用 ----
  const [monitorQuery, setMonitorQuery] = useState('');
  const [monitorResults, setMonitorResults] = useState<MonitorOption[]>([]);
  const [monitorSearching, setMonitorSearching] = useState(false);
  const [monitorSearched, setMonitorSearched] = useState(false);
  const [selectedMonitor, setSelectedMonitor] = useState<MonitorOption | null>(null);
  const [childOptions, setChildOptions] = useState<ChildOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const [orderNo, setOrderNo] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [shippedAt, setShippedAt] = useState('');
  const [shipmentOrderNo, setShipmentOrderNo] = useState('');
  const [sourceOrderId, setSourceOrderId] = useState<string | null>(null);
  const [orderCustomerShopifyId, setOrderCustomerShopifyId] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearched, setProductSearched] = useState(false);
  const [productSearchResults, setProductSearchResults] = useState<SearchProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductSelection[]>([]);

  const [manualBrand, setManualBrand] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualSku, setManualSku] = useState('');
  const [manualSize, setManualSize] = useState('');
  const [manualColor, setManualColor] = useState('');

  const [recurrenceType, setRecurrenceType] = useState<'once' | 'monthly'>('once');
  const [onceMediaDueDate, setOnceMediaDueDate] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [mediaDeadlineDay, setMediaDeadlineDay] = useState('10');
  const [cyclesCount, setCyclesCount] = useState('1');

  const [snsRequired, setSnsRequired] = useState(false);
  const [snsFrequency, setSnsFrequency] = useState<'every_cycle' | 'once'>('once');
  const [snsDeadlineDay, setSnsDeadlineDay] = useState('10');
  const [snsOnceDueDate, setSnsOnceDueDate] = useState('');

  const [formFields, setFormFields] = useState<FormFieldMaster[]>([]);
  const [enabledFieldKeys, setEnabledFieldKeys] = useState<Set<string>>(new Set());
  const [requiredFieldKeys, setRequiredFieldKeys] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) {
      loadEditCampaign();
    } else {
      loadFormFieldsMaster();
      applyPrefillFromParams();
    }
  }, []);

  useEffect(() => {
    if (selectedMonitor) loadChildren(selectedMonitor.id);
  }, [selectedMonitor?.id]);

  async function loadFormFieldsMaster() {
    const { data } = await supabase
      .from('form_fields')
      .select('key, label, input_type, is_system, sort_order')
      .order('sort_order', { ascending: true });
    const list = data ?? [];
    setFormFields(list);
    setEnabledFieldKeys(new Set(list.filter((f) => f.is_system).map((f) => f.key)));
    setRequiredFieldKeys(new Set(list.filter((f) => f.is_system).map((f) => f.key)));
  }

  function applyPrefillFromParams() {
    if (params.sourceOrderId) setSourceOrderId(params.sourceOrderId);
    if (params.shippedAt) setShippedAt(params.shippedAt);
    if (params.shipmentOrderNo) setShipmentOrderNo(params.shipmentOrderNo);
    if (params.monitorId && params.monitorName) {
      setSelectedMonitor({ id: params.monitorId, name: params.monitorName, nickname: null });
    }
    if (params.lineItems) {
      try {
        const items = JSON.parse(params.lineItems) as any[];
        const mapped: ProductSelection[] = items.map((li, idx) => ({
          key: `coupon-${idx}`,
          shopifyProductId: li.product_id ? `gid://shopify/Product/${li.product_id}` : null,
          shopifyVariantId: li.variant_id ? `gid://shopify/ProductVariant/${li.variant_id}` : null,
          title: li.title ?? '商品名未設定',
          brand: null,
          sku: li.sku ?? null,
          size: li.variant_title ?? null,
          color: null,
          imageUrl: null,
        }));
        setSelectedProducts(mapped);
        if (mapped[0] && params.monitorName) {
          setTitle(suggestCampaignTitle(mapped[0].title, params.monitorName));
        }
      } catch {
        // prefillの形式が崩れていても新規作成自体は続行できるようにする
      }
    }
  }

  async function loadChildren(monitorId: string) {
    const { data } = await supabase.from('children').select('id, call_name').eq('monitor_id', monitorId);
    setChildOptions(data ?? []);
  }

  function handleMonitorQueryChange(text: string) {
    setMonitorQuery(text);
    setMonitorSearched(false);
  }

  async function searchMonitors() {
    if (!monitorQuery) return;
    setMonitorSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('role', 'monitor')
      .ilike('name', `%${monitorQuery}%`)
      .limit(20);
    setMonitorResults(data ?? []);
    setMonitorSearching(false);
    setMonitorSearched(true);
  }

  function selectMonitor(m: MonitorOption) {
    setSelectedMonitor(m);
    setMonitorResults([]);
    setMonitorQuery('');
    setMonitorSearched(false);
    setSelectedChildId(null);
  }

  async function handleOrderLookup() {
    if (!orderNo) return;
    setOrderLoading(true);
    setOrderError(null);
    const { data, error } = await supabase.functions.invoke('shopify-order-lookup', {
      body: { orderNumber: orderNo },
    });
    setOrderLoading(false);

    if (error || data?.error) {
      setOrderError(data?.error ?? '注文の取得に失敗しました');
      return;
    }

    setShippedAt((data.orderedAt as string).slice(0, 10));
    setShipmentOrderNo(data.orderName);
    if (data.customer?.shopifyCustomerId) {
      setOrderCustomerShopifyId(data.customer.shopifyCustomerId);
    }
    if (data.matchedMonitor) {
      setSelectedMonitor({ id: data.matchedMonitor.id, name: data.matchedMonitor.name, nickname: null });
    }

    const mapped: ProductSelection[] = (data.lineItems ?? []).map((li: any, idx: number) => {
      const options: { name: string; value: string }[] = li.selectedOptions ?? [];
      const size = options.find((o) => /size|サイズ/i.test(o.name))?.value ?? null;
      const color = options.find((o) => /colou?r|カラー|色/i.test(o.name))?.value ?? null;
      return {
        key: `order-${idx}`,
        shopifyProductId: li.shopifyProductId ?? null,
        shopifyVariantId: li.shopifyVariantId ?? null,
        title: li.productTitle ?? '商品名未設定',
        brand: li.brand ?? null,
        sku: li.sku ?? null,
        size,
        color,
        imageUrl: li.imageUrl ?? null,
      };
    });
    setSelectedProducts(mapped);

    const monitorNameForTitle = data.matchedMonitor?.name ?? selectedMonitor?.name ?? data.customer?.name;
    if (mapped[0] && monitorNameForTitle) {
      setTitle(suggestCampaignTitle(mapped[0].brand ?? mapped[0].title, monitorNameForTitle));
    }
  }

  function handleProductQueryChange(text: string) {
    setProductQuery(text);
    setProductSearched(false);
  }

  async function handleProductSearch() {
    if (!productQuery) return;
    setProductSearchLoading(true);
    const { data, error } = await supabase.functions.invoke('shopify-product-search', {
      body: { query: productQuery },
    });
    setProductSearchLoading(false);
    setProductSearched(true);
    if (!error && !data?.error) {
      setProductSearchResults(data.products ?? []);
    } else {
      setProductSearchResults([]);
    }
  }

  function toggleVariantSelection(product: SearchProduct, variant: SearchVariant) {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.shopifyVariantId === variant.shopifyVariantId);
      if (exists) return prev.filter((p) => p.shopifyVariantId !== variant.shopifyVariantId);
      return [
        ...prev,
        {
          key: variant.shopifyVariantId,
          shopifyProductId: product.shopifyProductId,
          shopifyVariantId: variant.shopifyVariantId,
          title: product.title,
          brand: product.brand,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          imageUrl: variant.imageUrl ?? product.imageUrl,
        },
      ];
    });
  }

  function addManualProduct() {
    if (!manualTitle) return;
    setSelectedProducts((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${prev.length}`,
        shopifyProductId: null,
        shopifyVariantId: null,
        title: manualTitle,
        brand: manualBrand || null,
        sku: manualSku || null,
        size: manualSize || null,
        color: manualColor || null,
        imageUrl: null,
      },
    ]);
    setManualBrand('');
    setManualTitle('');
    setManualSku('');
    setManualSize('');
    setManualColor('');
  }

  function removeProduct(key: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.key !== key));
  }

  function toggleFieldEnabled(key: string) {
    setEnabledFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setRequiredFieldKeys((req) => {
          const r = new Set(req);
          r.delete(key);
          return r;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleFieldRequired(key: string) {
    setRequiredFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitError(null);

    if (!selectedMonitor) {
      setSubmitError('モニターを選択してください');
      return;
    }
    if (selectedProducts.length === 0) {
      setSubmitError('商品を1件以上選択してください');
      return;
    }
    if (!title.trim()) {
      setSubmitError('案件名を入力してください');
      return;
    }
    if (recurrenceType === 'once' && !onceMediaDueDate) {
      setSubmitError('提出期限日を入力してください');
      return;
    }
    if (recurrenceType === 'monthly' && (!startMonth || !mediaDeadlineDay || !cyclesCount)) {
      setSubmitError('繰り返し期限の設定を入力してください');
      return;
    }
    if (snsRequired) {
      if (recurrenceType === 'once' && !snsOnceDueDate) {
        setSubmitError('SNS投稿期限日を入力してください');
        return;
      }
      if (recurrenceType === 'monthly' && snsFrequency === 'every_cycle' && !snsDeadlineDay) {
        setSubmitError('SNS投稿期限(毎月◎日)を入力してください');
        return;
      }
      if (recurrenceType === 'monthly' && snsFrequency === 'once' && !snsOnceDueDate) {
        setSubmitError('SNS投稿期限日を入力してください');
        return;
      }
    }

    setSubmitting(true);
    try {
      const variantIds: string[] = [];
      for (const p of selectedProducts) {
        let productId: string;
        if (p.shopifyProductId) {
          const { data: productRow, error: productError } = await supabase
            .from('products')
            .upsert(
              {
                shopify_product_id: p.shopifyProductId,
                title: p.title,
                brand: p.brand,
                image_url: p.imageUrl,
                synced_at: new Date().toISOString(),
              },
              { onConflict: 'shopify_product_id' }
            )
            .select('id')
            .single();
          if (productError || !productRow) throw new Error('商品情報の保存に失敗しました');
          productId = productRow.id;
        } else {
          const { data: productRow, error: productError } = await supabase
            .from('products')
            .insert({ title: p.title, brand: p.brand })
            .select('id')
            .single();
          if (productError || !productRow) throw new Error('商品情報の保存に失敗しました');
          productId = productRow.id;
        }

        if (p.shopifyVariantId) {
          const { data: variantRow, error: variantError } = await supabase
            .from('variants')
            .upsert(
              {
                shopify_variant_id: p.shopifyVariantId,
                product_id: productId,
                sku: p.sku,
                size: p.size,
                color: p.color,
                image_url: p.imageUrl,
              },
              { onConflict: 'shopify_variant_id' }
            )
            .select('id')
            .single();
          if (variantError || !variantRow) throw new Error('バリアント情報の保存に失敗しました');
          variantIds.push(variantRow.id);
        } else {
          const { data: variantRow, error: variantError } = await supabase
            .from('variants')
            .insert({ product_id: productId, sku: p.sku, size: p.size, color: p.color })
            .select('id')
            .single();
          if (variantError || !variantRow) throw new Error('バリアント情報の保存に失敗しました');
          variantIds.push(variantRow.id);
        }
      }

      const campaignInsert: Record<string, unknown> = {
        title: title.trim(),
        monitor_id: selectedMonitor.id,
        child_id: selectedChildId,
        shipped_at: shippedAt || null,
        recurrence_type: recurrenceType,
        sns_required: snsRequired,
        reminder_enabled: reminderEnabled,
        internal_memo: internalMemo || null,
        shooting_guideline: shootingGuideline || null,
        source_order_id: sourceOrderId,
        shipment_order_no: shipmentOrderNo || null,
        status: 'active',
      };

      if (recurrenceType === 'monthly') {
        campaignInsert.media_deadline_day = parseInt(mediaDeadlineDay, 10);
        campaignInsert.cycles_count = parseInt(cyclesCount, 10);
        campaignInsert.start_month = `${startMonth}-01`;
      } else {
        campaignInsert.cycles_count = 1;
      }

      if (snsRequired) {
        if (recurrenceType === 'once' || snsFrequency === 'once') {
          campaignInsert.sns_frequency = 'once';
          campaignInsert.sns_once_due_date = snsOnceDueDate;
        } else {
          campaignInsert.sns_frequency = 'every_cycle';
          campaignInsert.sns_deadline_day = parseInt(snsDeadlineDay, 10);
        }
      }

      const { data: campaignRow, error: campaignError } = await supabase
        .from('campaigns')
        .insert(campaignInsert as never)
        .select('id, campaign_no')
        .single();

      if (campaignError || !campaignRow) {
        throw new Error(`案件の作成に失敗しました: ${campaignError?.message ?? ''}`);
      }
      const campaignId = campaignRow.id;

      const { error: cvError } = await supabase
        .from('campaign_variants')
        .insert(variantIds.map((variantId) => ({ campaign_id: campaignId, variant_id: variantId })));
      if (cvError) throw new Error('商品の紐付けに失敗しました');

      const fieldRows = Array.from(new Set([...enabledFieldKeys, 'shot_date'])).map((key) => ({
        campaign_id: campaignId,
        form_field_key: key,
        is_required: key === 'shot_date' ? true : requiredFieldKeys.has(key),
      }));
      const { error: ffError } = await supabase.from('campaign_form_fields').insert(fieldRows);
      if (ffError) throw new Error('提出フォーム項目の保存に失敗しました');

      const generated =
        recurrenceType === 'once'
          ? generateCyclesAndTasks({
              recurrenceType: 'once',
              onceMediaDueDate,
              snsRequired,
              snsOnceDueDate: snsRequired ? snsOnceDueDate : undefined,
            })
          : generateCyclesAndTasks({
              recurrenceType: 'monthly',
              cyclesCount: parseInt(cyclesCount, 10),
              startMonth: `${startMonth}-01`,
              mediaDeadlineDay: parseInt(mediaDeadlineDay, 10),
              snsRequired,
              snsFrequency,
              snsDeadlineDay: snsFrequency === 'every_cycle' ? parseInt(snsDeadlineDay, 10) : undefined,
              snsOnceDueDate: snsFrequency === 'once' ? snsOnceDueDate : undefined,
            });

      const { data: cycleRowsInserted, error: cyclesError } = await supabase
        .from('cycles')
        .insert(generated.cycles.map((c) => ({ campaign_id: campaignId, cycle_no: c.cycleNo, label: c.label })))
        .select('id, cycle_no');
      if (cyclesError || !cycleRowsInserted) throw new Error('回次の作成に失敗しました');

      const cycleIdByNo = new Map(cycleRowsInserted.map((c) => [c.cycle_no, c.id]));
      const taskRows = generated.tasks.map((t) => ({
        cycle_id: cycleIdByNo.get(t.cycleNo)!,
        type: t.type,
        due_date: t.dueDate,
        status: 'pending' as const,
      }));
      const { error: tasksError } = await supabase.from('tasks').insert(taskRows);
      if (tasksError) throw new Error('タスクの作成に失敗しました');

      if (sourceOrderId) {
        await supabase
          .from('coupon_orders')
          .update({ campaign_id: campaignId, status: 'converted' })
          .eq('id', sourceOrderId);
      }

      if (orderCustomerShopifyId) {
        const { data: monitorProfile } = await supabase
          .from('profiles')
          .select('shopify_customer_id')
          .eq('id', selectedMonitor.id)
          .maybeSingle();
        if (monitorProfile && !monitorProfile.shopify_customer_id) {
          await supabase
            .from('profiles')
            .update({ shopify_customer_id: orderCustomerShopifyId })
            .eq('id', selectedMonitor.id);
        }
      }

      const { error: dropboxError } = await supabase.functions.invoke(
        'dropbox-create-campaign-folders',
        { body: { campaignId } }
      );
      if (dropboxError) {
        setSubmitting(false);
        setSubmitError(
          '案件は作成されましたが、Dropboxフォルダの作成に失敗しました。案件一覧から確認してください。'
        );
        router.replace('/admin-campaign-list');
        return;
      }

      router.replace('/admin-campaign-list');
    } catch (err: any) {
      setSubmitError(err?.message ?? '案件の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadEditCampaign() {
    setEditLoading(true);
    setEditError(null);

    const { data: campaign } = await supabase
      .from('campaigns')
      .select(
        'id, campaign_no, title, reminder_enabled, internal_memo, shooting_guideline, dropbox_base_path, recurrence_type, cycles_count, media_deadline_day, monitor:profiles(name)'
      )
      .eq('id', params.id as string)
      .maybeSingle();

    if (!campaign) {
      setEditError('案件が見つかりませんでした');
      setEditLoading(false);
      return;
    }

    const { data: variantLinks } = await supabase
      .from('campaign_variants')
      .select('variant_id')
      .eq('campaign_id', params.id as string);

    let productSummary = '(商品情報なし)';
    if (variantLinks && variantLinks.length > 0) {
      const { data: variantsData } = await supabase
        .from('variants')
        .select('sku, product_id')
        .in('id', variantLinks.map((v) => v.variant_id));
      const productIds = Array.from(new Set((variantsData ?? []).map((v) => v.product_id)));
      const { data: productsData } = await supabase
        .from('products')
        .select('id, title')
        .in('id', productIds);
      const productById = new Map((productsData ?? []).map((p) => [p.id, p]));
      productSummary = (variantsData ?? [])
        .map((v) => `${productById.get(v.product_id)?.title ?? '商品名未設定'}${v.sku ? ` (${v.sku})` : ''}`)
        .join(' / ');
    }

    const recurrenceSummary =
      campaign.recurrence_type === 'once'
        ? '単発'
        : `毎月${campaign.media_deadline_day}日 / 全${campaign.cycles_count}回`;

    setEditCampaign({
      id: campaign.id,
      campaignNo: campaign.campaign_no,
      monitorName: (campaign as any).monitor?.name ?? null,
      productSummary,
      recurrenceSummary,
      dropboxBasePath: campaign.dropbox_base_path,
    });

    setTitle(campaign.title);
    setReminderEnabled(campaign.reminder_enabled);
    setInternalMemo(campaign.internal_memo ?? '');
    setShootingGuideline(campaign.shooting_guideline ?? '');

    const { data: cycles } = await supabase
      .from('cycles')
      .select('id, cycle_no, label, tasks(type, due_date, status)')
      .eq('campaign_id', params.id as string)
      .order('cycle_no', { ascending: true });

    const rows: CycleRow[] = (cycles ?? []).map((c: any) => {
      const media = (c.tasks ?? []).find((t: any) => t.type === 'media');
      const sns = (c.tasks ?? []).find((t: any) => t.type === 'sns');
      return {
        cycleNo: c.cycle_no,
        label: c.label,
        mediaDueDate: media?.due_date ?? null,
        mediaStatus: media?.status ?? null,
        snsDueDate: sns?.due_date ?? null,
        snsStatus: sns?.status ?? null,
        dotStatus: deriveCycleStatus(c.tasks ?? []),
      };
    });
    setCycleRows(rows);
    setEditLoading(false);
  }

  async function handleEditSave() {
    if (!editCampaign) return;
    setEditSaving(true);
    setEditSaved(false);
    const { error } = await supabase
      .from('campaigns')
      .update({
        title: title.trim(),
        shooting_guideline: shootingGuideline || null,
        reminder_enabled: reminderEnabled,
        internal_memo: internalMemo || null,
      })
      .eq('id', editCampaign.id);
    setEditSaving(false);
    if (!error) setEditSaved(true);
  }

  if (isEdit) {
    if (editLoading || !editCampaign) {
      return (
        <View className="flex-1 bg-bg items-center justify-center">
          {editError ? <ErrorBanner message={editError} /> : <ActivityIndicator color="#7E8F86" />}
        </View>
      );
    }

    return (
      <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
        <Text className="font-body text-caption text-ink-soft mb-1">
          {formatCampaignNo(editCampaign.campaignNo)}
        </Text>
        <Text className="font-body text-caption text-ink-soft mb-1">
          {editCampaign.monitorName ?? '(モニター不明)'} ・ {editCampaign.productSummary}
        </Text>
        <Text className="font-body text-caption text-ink-soft mb-6">{editCampaign.recurrenceSummary}</Text>

        <TextField label="案件名" value={title} onChangeText={setTitle} />
        <TextField
          label="撮影ガイドライン"
          value={shootingGuideline}
          onChangeText={setShootingGuideline}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />

        <View className="flex-row items-center justify-between mb-4">
          <Text className="font-body text-body text-ink">リマインド</Text>
          <Switch value={reminderEnabled} onValueChange={setReminderEnabled} />
        </View>

        <TextField
          label="社内メモ(モニターには非表示)"
          value={internalMemo}
          onChangeText={setInternalMemo}
          multiline
          numberOfLines={3}
        />

        <AppButton label={editSaving ? '保存中…' : '保存する'} onPress={handleEditSave} loading={editSaving} />
        {editSaved && (
          <Text className="font-body text-caption text-accent-ink mt-2 text-center">保存しました</Text>
        )}

        <Text className="font-body-medium text-body text-ink mt-8 mb-3">回次・タスク</Text>
        {cycleRows.map((row) => (
          <View
            key={row.cycleNo}
            className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-body-medium text-body text-ink">{row.label}</Text>
              <CycleDots statuses={[row.dotStatus]} />
            </View>
            {row.mediaDueDate && (
              <Text className="font-body text-caption text-ink-soft">
                データ提出: {row.mediaDueDate}({TASK_STATUS_LABEL[row.mediaStatus ?? 'pending']})
              </Text>
            )}
            {row.snsDueDate && (
              <Text className="font-body text-caption text-ink-soft">
                SNS投稿: {row.snsDueDate}({TASK_STATUS_LABEL[row.snsStatus ?? 'pending']})
              </Text>
            )}
          </View>
        ))}

        {editCampaign.dropboxBasePath && (
          <Text className="font-body text-caption text-ink-soft mt-4">
            Dropbox: {editCampaign.dropboxBasePath}
          </Text>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="font-body-medium text-body text-ink mb-2">モニター</Text>
      {selectedMonitor ? (
        <View className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-4 flex-row items-center justify-between">
          <Text className="font-body text-body text-ink">{selectedMonitor.name}</Text>
          <Pressable onPress={() => setSelectedMonitor(null)}>
            <Text className="font-body text-caption text-accent-ink">変更</Text>
          </Pressable>
        </View>
      ) : (
        <View className="mb-4">
          <TextField
            label="モニター名で検索"
            value={monitorQuery}
            onChangeText={handleMonitorQueryChange}
            onSubmitEditing={searchMonitors}
            returnKeyType="search"
          />
          <AppButton
            label={monitorSearching ? '検索中…' : '検索する'}
            onPress={searchMonitors}
            disabled={!monitorQuery || monitorSearching}
            loading={monitorSearching}
            variant="secondary"
          />
          {monitorSearched && !monitorSearching && monitorResults.length === 0 && (
            <Text className="font-body text-caption text-ink-soft mt-2">
              該当するモニターが見つかりませんでした
            </Text>
          )}
          {monitorResults.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => selectMonitor(m)}
              className="bg-surface rounded-card border-hairline border-line px-4 py-3 mt-2 flex-row items-center justify-between"
            >
              <Text className="font-body text-body text-ink">
                {m.name}
                {m.nickname ? `(${m.nickname})` : ''}
              </Text>
              <Text className="font-body text-caption text-accent-ink">選ぶ ›</Text>
            </Pressable>
          ))}
        </View>
      )}

      {selectedMonitor && childOptions.length > 0 && (
        <View className="mb-4">
          <Text className="font-body-medium text-body text-ink mb-2">対象の子ども(任意)</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {childOptions.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setSelectedChildId(selectedChildId === c.id ? null : c.id)}
                className={`rounded-control border px-3 py-2 ${
                  selectedChildId === c.id ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text
                  className={`font-body text-caption ${
                    selectedChildId === c.id ? 'text-white' : 'text-ink'
                  }`}
                >
                  {c.call_name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">Shopify注文の取込(任意)</Text>
      <View className="flex-row items-end mb-2">
        <View className="flex-1 mr-2">
          <TextField label="注文番号" value={orderNo} onChangeText={setOrderNo} placeholder="#1001" />
        </View>
      </View>
      <AppButton
        label={orderLoading ? '取込中…' : '取込む'}
        onPress={handleOrderLookup}
        disabled={!orderNo}
        loading={orderLoading}
        variant="secondary"
      />
      {orderError && <ErrorBanner message={orderError} />}
      {shipmentOrderNo && (
        <Text className="font-body text-caption text-ink-soft mt-2">
          注文{shipmentOrderNo} ・ 発送日候補 {shippedAt}
        </Text>
      )}

      <Text className="font-body-medium text-body text-ink mb-2 mt-6">
        選択中の商品(複数可){selectedProducts.length > 0 ? ` ・ ${selectedProducts.length}件` : ''}
      </Text>
      {selectedProducts.length === 0 && (
        <Text className="font-body text-caption text-ink-soft mb-2">
          まだ商品が選択されていません。下で検索するか、手動で追加してください
        </Text>
      )}
      {selectedProducts.map((p) => (
        <View
          key={p.key}
          className="bg-surface rounded-card border-2 border-accent px-4 py-3 mb-2 flex-row items-center justify-between"
        >
          <View className="flex-1">
            <Text className="font-body-medium text-body text-ink">✓ {p.title}</Text>
            <Text className="font-body text-caption text-ink-soft">
              {[p.sku, p.size, p.color].filter(Boolean).join(' / ') || 'SKU未設定'}
            </Text>
          </View>
          <Pressable onPress={() => removeProduct(p.key)} hitSlop={8}>
            <Text className="font-body text-caption text-status-overdue">削除</Text>
          </Pressable>
        </View>
      ))}

      <Text className="font-body-medium text-caption text-ink-soft mt-4 mb-2">商品を検索して追加</Text>
      <TextField
        label="商品検索(Shopify)"
        value={productQuery}
        onChangeText={handleProductQueryChange}
        onSubmitEditing={handleProductSearch}
        returnKeyType="search"
      />
      <AppButton
        label={productSearchLoading ? '検索中…' : '検索する'}
        onPress={handleProductSearch}
        disabled={!productQuery || productSearchLoading}
        loading={productSearchLoading}
        variant="secondary"
      />
      {productSearched && !productSearchLoading && productSearchResults.length === 0 && (
        <Text className="font-body text-caption text-ink-soft mt-2">
          該当する商品が見つかりませんでした
        </Text>
      )}
      {productSearchResults.map((product) => (
        <View key={product.shopifyProductId} className="mt-3">
          <View className="flex-row items-center mb-1">
            {product.imageUrl && (
              <Image
                source={{ uri: product.imageUrl }}
                style={{ width: 32, height: 32, borderRadius: 6, marginRight: 8 }}
              />
            )}
            <Text className="font-body-medium text-caption text-ink">{product.title}</Text>
          </View>
          {product.variants.map((variant) => {
            const isSelected = selectedProducts.some((p) => p.shopifyVariantId === variant.shopifyVariantId);
            return (
              <Pressable
                key={variant.shopifyVariantId}
                onPress={() => toggleVariantSelection(product, variant)}
                hitSlop={4}
                className={`rounded-control border-2 px-3 py-3 mb-2 ${
                  isSelected ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text
                  className={`${isSelected ? 'font-body-medium text-white' : 'font-body text-ink'} text-caption`}
                >
                  {isSelected ? '✓ ' : ''}
                  {[variant.sku, variant.size, variant.color].filter(Boolean).join(' / ')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <Text className="font-body-medium text-caption text-ink-soft mt-4 mb-2">
        Shopify未登録品は手動で追加できます
      </Text>
      <TextField label="ブランド" value={manualBrand} onChangeText={setManualBrand} />
      <TextField label="商品名" value={manualTitle} onChangeText={setManualTitle} />
      <TextField label="SKU" value={manualSku} onChangeText={setManualSku} />
      <TextField label="サイズ" value={manualSize} onChangeText={setManualSize} />
      <TextField label="カラー" value={manualColor} onChangeText={setManualColor} />
      <View className="mb-4">
        <AppButton label="手動で追加する" onPress={addManualProduct} disabled={!manualTitle} variant="secondary" />
      </View>

      <TextField label="案件名" value={title} onChangeText={setTitle} />

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">提出期限設定</Text>
      <View className="flex-row mb-3" style={{ gap: 8 }}>
        <Pressable
          onPress={() => setRecurrenceType('once')}
          className={`flex-1 rounded-control border py-3 items-center ${
            recurrenceType === 'once' ? 'border-accent bg-accent' : 'border-line bg-surface'
          }`}
        >
          <Text className={`font-body-medium ${recurrenceType === 'once' ? 'text-white' : 'text-ink'}`}>
            単発
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setRecurrenceType('monthly')}
          className={`flex-1 rounded-control border py-3 items-center ${
            recurrenceType === 'monthly' ? 'border-accent bg-accent' : 'border-line bg-surface'
          }`}
        >
          <Text className={`font-body-medium ${recurrenceType === 'monthly' ? 'text-white' : 'text-ink'}`}>
            繰り返し
          </Text>
        </Pressable>
      </View>

      {recurrenceType === 'once' ? (
        <TextField
          label="提出期限日(YYYY-MM-DD)"
          value={onceMediaDueDate}
          onChangeText={setOnceMediaDueDate}
          placeholder="2026-08-10"
        />
      ) : (
        <>
          <TextField
            label="開始月(YYYY-MM)"
            value={startMonth}
            onChangeText={setStartMonth}
            placeholder="2026-08"
          />
          <TextField
            label="毎月◎日まで"
            value={mediaDeadlineDay}
            onChangeText={setMediaDeadlineDay}
            keyboardType="number-pad"
          />
          <TextField
            label="全n回"
            value={cyclesCount}
            onChangeText={setCyclesCount}
            keyboardType="number-pad"
          />
        </>
      )}

      <View className="flex-row items-center justify-between mb-4 mt-2">
        <Text className="font-body text-body text-ink">SNS投稿必須</Text>
        <Switch value={snsRequired} onValueChange={setSnsRequired} />
      </View>

      {snsRequired && (
        <>
          {recurrenceType === 'monthly' && (
            <View className="flex-row mb-3" style={{ gap: 8 }}>
              <Pressable
                onPress={() => setSnsFrequency('every_cycle')}
                className={`flex-1 rounded-control border py-3 items-center ${
                  snsFrequency === 'every_cycle' ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text
                  className={`font-body-medium ${snsFrequency === 'every_cycle' ? 'text-white' : 'text-ink'}`}
                >
                  毎回
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSnsFrequency('once')}
                className={`flex-1 rounded-control border py-3 items-center ${
                  snsFrequency === 'once' ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text className={`font-body-medium ${snsFrequency === 'once' ? 'text-white' : 'text-ink'}`}>
                  案件全体で1回
                </Text>
              </Pressable>
            </View>
          )}

          {recurrenceType === 'monthly' && snsFrequency === 'every_cycle' ? (
            <TextField
              label="SNS投稿期限(毎月◎日)"
              value={snsDeadlineDay}
              onChangeText={setSnsDeadlineDay}
              keyboardType="number-pad"
            />
          ) : (
            <TextField
              label="SNS投稿期限日(YYYY-MM-DD)"
              value={snsOnceDueDate}
              onChangeText={setSnsOnceDueDate}
              placeholder="2026-08-10"
            />
          )}
        </>
      )}

      <View className="flex-row items-center justify-between mb-4 mt-2">
        <Text className="font-body text-body text-ink">リマインド</Text>
        <Switch value={reminderEnabled} onValueChange={setReminderEnabled} />
      </View>

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">提出フォーム項目</Text>
      {formFields.map((f) => (
        <View
          key={f.key}
          className="flex-row items-center justify-between mb-2 bg-surface rounded-card border-hairline border-line px-4 py-3"
        >
          <Text className="font-body text-body text-ink">{f.label}</Text>
          <View className="flex-row items-center" style={{ gap: 16 }}>
            {enabledFieldKeys.has(f.key) && !f.is_system && (
              <Pressable onPress={() => toggleFieldRequired(f.key)}>
                <Text
                  className={`font-body text-caption ${
                    requiredFieldKeys.has(f.key) ? 'text-accent-ink' : 'text-ink-soft'
                  }`}
                >
                  必須
                </Text>
              </Pressable>
            )}
            <Switch
              value={enabledFieldKeys.has(f.key)}
              onValueChange={() => toggleFieldEnabled(f.key)}
              disabled={f.is_system}
            />
          </View>
        </View>
      ))}

      <TextField
        label="撮影ガイドライン"
        value={shootingGuideline}
        onChangeText={setShootingGuideline}
        multiline
        numberOfLines={4}
        maxLength={1000}
      />
      <TextField
        label="社内メモ(モニターには非表示)"
        value={internalMemo}
        onChangeText={setInternalMemo}
        multiline
        numberOfLines={3}
      />

      {submitError && <ErrorBanner message={submitError} />}
      <AppButton
        label={submitting ? '登録中…' : '登録する'}
        onPress={handleSubmit}
        loading={submitting}
      />
    </ScrollView>
  );
}
