import {
  ModelCategory,
  MODEL_CATEGORIES,
  CATEGORY_LABELS,
} from '../types/models';

interface CategoryTabsProps {
  activeCategory: ModelCategory;
  onCategoryChange: (category: ModelCategory) => void;
}

export default function CategoryTabs({
  activeCategory,
  onCategoryChange,
}: CategoryTabsProps) {
  return (
    <div className="category-tabs">
      {MODEL_CATEGORIES.map((category) => (
        <button
          key={category}
          className={`category-tab ${activeCategory === category ? 'active' : ''}`}
          onClick={() => onCategoryChange(category)}
        >
          {CATEGORY_LABELS[category]}
        </button>
      ))}
    </div>
  );
}
